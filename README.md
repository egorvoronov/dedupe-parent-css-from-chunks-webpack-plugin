# Dedupe parent css from chunks webpack plugin

A Webpack plugin that removes duplicate css rules from chunks leaving them only in the parent css asset.

## Many thanks
Inititially, I thought that such kind of optimization could be part of amazing Nuno's Rodrigues [NMFR/optimize-css-assets-webpack-plugin](https://github.com/NMFR/optimize-css-assets-webpack-plugin), but just to have flies and meatball separately I just created the fork and did the job here. It could be that when you start working with that plugin such feature is already implemented in optimize-css-assets-webpack-plugin, so check that first before download that one (see [https://github.com/NMFR/optimize-css-assets-webpack-plugin/issues/41] for the details)

## What does the plugin do?

It will find all the parents for every chunk, will compare the css rules and will remove the duplicates from chunks only leaving the original rules only inside parent chunks (it uses [postcss](https://github.com/postcss/postcss) and  [postcss-discard-duplicates](https://github.com/ben-eb/postcss-discard-duplicates) for processing the assets).

### Solves [extract-css-chunks-webpack-plugin](https://github.com/faceyspacey/extract-css-chunks-webpack-plugin) CSS duplication in chunks problem:

Since [extract-css-chunks-webpack-plugin](https://github.com/faceyspacey/extract-css-chunks-webpack-plugin) creates separate css chunk for every your splitted js chunk it turns out that your css chunk could contain the rule that are already in the parent asset.

## Installation:

Using npm:
```shell
$ npm install --save-dev dedupe-parent-css-from-chunks-webpack-plugin
```

> :warning: This works only for webpack v3 or below. PRs are welcome for webpack v4 and above.

## Configuration:

The plugin can receive the following options (all of them are optional):
* assetNameRegExp: A regular expression that indicates the names of the assets that should be optimized \ minimized. The regular expression provided is run against the filenames of the files exported by the ExtractCssChunksPlugin instances in your configuration, not the filenames of your source CSS files. Defaults to `/\.css$/g`
* filterParentsRegExp: A regular expression that indicates the names of the parent assets that should be optimized \ minimized. The regular expression provided is run against the parent filenames and needs to resolve which parents should take the duplication rules from its child (See https://github.com/egorvoronov/dedupe-parent-css-from-chunks-webpack-plugin/issues/1 for the details). Defaults to `null` which means all the parents would take away the duplication rules from its children

* map: An object that would be passed as postcss processor option, defaults is `undefined`
* canPrint: A boolean indicating if the plugin can print messages to the console, defaults to `true`

## Example:

``` javascript
const ExtractCssChunks = require("extract-css-chunks-webpack-plugin");
const DedupeParentCssFromChunksWebpackPlugin = require('dedupe-parent-css-from-chunks-webpack-plugin');

module.exports = {
  module: {
    rules: [
      {
        test: /\.css$/,
        loader: ExtractCssChunks.extract('style-loader', 'css-loader')
      }
    ]
  },
  plugins: [
    new ExtractCssChunks('styles.css'),
    new DedupeParentCssFromChunksWebpackPlugin({
      assetNameRegExp: /\.optimize\.css$/g, // the default is /\.css$/g
      filterParentsRegExp: /\.parent-always-loaded\.css$/g, // the default is null
      map: { prev: ... } // the default is undefined
      canPrint: true // the default is true
    })
  ]
};
```

## License

MIT (http://www.opensource.org/licenses/mit-license.php)
