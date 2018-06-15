const LastCallWebpackPlugin = require('last-call-webpack-plugin');
const postcss = require('postcss');
const jsDiff = require('diff');
const postcssDiscardDuplicates = require('postcss-discard-duplicates');

function DedupeParentCssFromChunksWebpackPlugin(options) {
    this.options = options || {};
    this.options.assetNameRegExp = this.options.assetNameRegExp || /\.css$/g;
    this.options.baseFileRegExp = this.options.baseFileRegExp || this.options.assetNameRegExp;
    this.options.canPrint = this.options.canPrint !== undefined ? this.options.canPrint : true;
    this.options.map = this.options.map || undefined;

    const self = this;
    this.lastCallInstance = new LastCallWebpackPlugin({
        assetProcessors: [
            {
                phase: LastCallWebpackPlugin.PHASE.OPTIMIZE_CHUNK_ASSETS,
                regExp: this.options.assetNameRegExp,
                processor: function (assetName, asset, assets) {
                    return self.dedupeCssInChunk(assetName, asset, assets);
                },
            },
            {
                phase: LastCallWebpackPlugin.PHASE.OPTIMIZE_ASSETS,
                regExp: this.options.assetNameRegExp,
                processor: function () {
                    return self.dedupeCssInRules.apply(self, arguments);
                },
            }
        ],
        canPrint: this.options.canPrint
    });
};

DedupeParentCssFromChunksWebpackPlugin.prototype.getSplitFilenameSeparator = (assetName) => `/*splitfilename=${assetName}*/`;

DedupeParentCssFromChunksWebpackPlugin.prototype.dedupeCssInChunk = function (assetName, asset, assets) {
    const css = asset.source();

    // To check if this is a child chunk
    let chunkOfAsset = assets.compilation.chunks.filter(chunk => chunk.files.indexOf(assetName) !== -1);
    if (chunkOfAsset.length !== 1) {
        // skipping dedupe
        console.warn('DedupeParentCssFromChunksWebpackPlugin.dedupeCssInChunk() Error getting the chunk for asset', assetName);
        return Promise.resolve(css);
    }
    chunkOfAsset = chunkOfAsset[0];
    const allParentsChunks = chunkOfAsset.parents;
    if (!allParentsChunks || !allParentsChunks.length) {
        // no parents then just return css
        return Promise.resolve(css);
    }

    // This is the child chunk so we need to get all the parent sources
    const allParentsFilesSources = allParentsChunks
        .map(parentChunk => parentChunk.files)
        .reduce((a, b) => a.concat(b), [])
        .filter(file => this.options.baseFileRegExp.test(file))
        .map(file => assets.getAsset(file))
        .join('');

    if (allParentsFilesSources.trim() === '') {
        // no parent css contents then just return css
        return Promise.resolve(css);
    }

    // Create combined file for further comparison and analysing
    const newCssContent = `${css}${this.getSplitFilenameSeparator(assetName)}${allParentsFilesSources}`;

    // define discard duplicate process options
    const discardDuplicatesProcessOptions = {
        from: assetName,
        to: assetName,
        map: this.options.map,
    };

    // Add prev source map from assets in case it is not provided explicitly
    if (this.options.map && !this.options.map.prev) {
        try {
            const mapJson = assets.getAsset(assetName + '.map');
            if (mapJson) {
                const map = JSON.parse(mapJson);
                if (
                    map &&
                    (
                        (map.sources && map.sources.length > 0) ||
                        (map.mappings && map.mappings.length > 0)
                    )
                ) {
                    discardDuplicatesProcessOptions.map = Object.assign({ prev: mapJson }, this.options.map);
                }
            }
        } catch (err) {
            console.warn('DedupeParentCssFromChunksWebpackPlugin.dedupeCssInChunk() Error getting previous source map', err);
        }
    }

    // remove duplicates
    return postcss(postcssDiscardDuplicates).process(newCssContent, discardDuplicatesProcessOptions)
        .then((result) => {
            let dedupedCss = result.css;

            // remove all before splitfilename with index of splitfilename
            const filenameseparatorIndex = dedupedCss.indexOf(this.getSplitFilenameSeparator(assetName));
            dedupedCss = dedupedCss.slice(0, filenameseparatorIndex);

            if (this.options.map && result.map && result.map.toString) {
                // todo we need to slice sourcemap as well starting from filenameseparatorIndex
                assets.setAsset(assetName + '.map', result.map.toString());
            }

            return dedupedCss;
        });
};

let dedupeCssInRulesDone = false;
DedupeParentCssFromChunksWebpackPlugin.prototype.dedupeCssInRules = function (assetName, asset, assets) {
    /*
    * This would be the algorithm for rules parsing
        {
            destination: /\/app\..*?\.?css$/g,
            duplications: [ /\/MiniPDPInterstitial\..*?\.?css$/g, /\/ErrorFullPage\..*?\.?css$/g ],
        }
    * 1. concat the files together
    * 2. save as original file
    * 3. do the deduplication
    * 4. save as output
    * 5. compare original file with the output - get the diff
    * 6. put the diff into the destination file
    * 7. remove the duplication in destination file if exist
    * 8. remove the duplication in duplication files
    */

    const getResult = () => Promise.resolve(assets.getAsset(assetName));
    if (dedupeCssInRulesDone) {
        return getResult();
    }
    dedupeCssInRulesDone = true;

    const compilationAssets = Object.keys(assets.compilation.assets);
    if (Array.isArray(this.options.rules) && this.options.rules.length) {
        // Concat the files together
        const fileSources = [];
        return Promise.all(this.options.rules.map(rule => {
            const destinationRegExp = rule.destination;
            const duplicationsRegExps = rule.duplications;

            const filesSourcesToRemoveDupsFrom = duplicationsRegExps
                .map(dupRegEx => {
                    const filename = compilationAssets.filter(filename => dupRegEx.test(filename))[0];
                    if (filename) {
                        const source = assets.getAsset(filename);
                        fileSources.push({
                            filename,
                            source,
                        });
                        return source;
                    }
                    return;
                })
                .filter(source => source)
                .join('');

            if (filesSourcesToRemoveDupsFrom.trim() === '') {
                return;
            }

            // Do the deduplication
            // define discard duplicate process options
            const discardDuplicatesProcessOptions = {
                from: 'filesSourcesAfterTheDeduplication.css',
                to: 'filesSourcesAfterTheDeduplication.css',
            };

            return postcss(postcssDiscardDuplicates).process(filesSourcesToRemoveDupsFrom, discardDuplicatesProcessOptions)
                .then((result) => {
                    // Save as output
                    const dedupedCss = result.css;

                    // Compare original file with the output - get the diff
                    const removedParts = jsDiff.diffCss(filesSourcesToRemoveDupsFrom, dedupedCss).filter(diff => diff.removed).map(diff => diff.value).join('');

                    // Put the diff into the destination file
                    const destinationFilename = compilationAssets.filter(filename => destinationRegExp.test(filename))[0];
                    const destinationFileSource = assets.getAsset(destinationFilename);

                    if (fileSources.map(fileSource => fileSource.filename).indexOf(destinationFilename) !== -1) {
                        throw new Error("Destination file should not be part of duplications array");
                    }

                    if (destinationFilename && destinationFileSource) {
                        let allConsideredFilesSource = '';
                        fileSources.forEach(fileSource => {
                            allConsideredFilesSource += `${fileSource.source}${this.getSplitFilenameSeparator(fileSource.filename)}`;
                        })
                        allConsideredFilesSource += `${destinationFileSource}\n${removedParts}${this.getSplitFilenameSeparator(destinationFilename)}`;

                        return postcss(postcssDiscardDuplicates).process(allConsideredFilesSource, {
                            from: 'allConsideredFilesSource.css',
                            to: 'allConsideredFilesSource.css',
                        }).then(result => {
                            let dedupedCss = result.css;

                            for (let i = 0; i < (fileSources.length + 1); i++) {
                                let assetName;
                                if (fileSources[i]) {
                                    assetName = fileSources[i].filename;
                                } else {
                                    assetName = destinationFilename;
                                }
                                const separator = this.getSplitFilenameSeparator(assetName);
                                const filenameseparatorIndex = dedupedCss.indexOf(separator);
                                const newFileSource = dedupedCss.slice(0, filenameseparatorIndex);
                                dedupedCss = dedupedCss.slice(filenameseparatorIndex + separator.length, dedupedCss.length);

                                assets.setAsset(assetName, newFileSource);
                            }

                            return;
                        });
                    }

                    return;
                });
        })).then(getResult);
    } else {
        // to do one time logic goes here
        const baseFilenames = compilationAssets.filter(filename => this.options.baseFileRegExp.test(filename));

        if (baseFilenames.length === 1) {
            const baseFilename = baseFilenames[0];
            const baseFileSource = assets.getAsset(baseFilename);
            return postcss(postcssDiscardDuplicates)
                .process(baseFileSource, {
                    from: baseFilename,
                    to: baseFilename,
                })
                .then((result) => {
                    const dedupedCss = result.css;

                    assets.setAsset(baseFilename, dedupedCss);

                    return getResult();
                });
        }

        return getResult();
    }
};

DedupeParentCssFromChunksWebpackPlugin.prototype.apply = function (compiler) {
    return this.lastCallInstance.apply(compiler);
};

module.exports = DedupeParentCssFromChunksWebpackPlugin;
