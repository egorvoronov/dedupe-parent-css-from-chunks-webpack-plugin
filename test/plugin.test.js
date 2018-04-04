import DedupeParentCssFromChunksWebpackPlugin from '../src/';

describe('plugin test', () => {
    it('does not throw when called', () => {
        expect(() => {
            new DedupeParentCssFromChunksWebpackPlugin();
        }).not.toThrow();
    });

    it('can override default parameters', () => {
        const assetNameRegExp = /\.optimize\.css$/
        const canPrint = false;
        const map = { prev: {} };
        const plugin = new DedupeParentCssFromChunksWebpackPlugin({
            assetNameRegExp,
            canPrint,
            map,
        });
        expect(plugin.options.assetNameRegExp).toEqual(assetNameRegExp);
        expect(plugin.options.canPrint).toEqual(canPrint);
        expect(plugin.options.map).toEqual(map);
    });
});
