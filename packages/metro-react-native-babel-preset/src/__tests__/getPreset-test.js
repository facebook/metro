const main = require('../configs/main');
const getPreset = main.getPreset;

const transformBlockScoping = require('@babel/plugin-transform-block-scoping');
const transformTemplateLiterals = require('@babel/plugin-transform-template-literals');
const transformRegenerator = require('@babel/plugin-transform-regenerator');

describe('getPreset', () => {
  const baseOptions = {
    enableBabelRuntime: true,
  };

  it('returns default plugins', () => {
    const preset = getPreset(null, baseOptions);

    const defaultPlugins = preset.overrides[1].plugins;
    const extraPlugins = preset.overrides[4].plugins;

    expect(defaultPlugins.length).toBe(16);
    expect(extraPlugins.length).toBe(16);

    expect(defaultPlugins.some(plugin => plugin[0] === transformBlockScoping)).toBe(true);
    expect(defaultPlugins.some(plugin => plugin[0] === transformRegenerator)).toBe(true);
    expect(extraPlugins.some(plugin => plugin[0] === transformTemplateLiterals)).toBe(true);
  });

  it('returns optimized plugins for transformProfile "jsc-ios10.3"', () => {
    const options = {unstable_transformProfile: 'jsc-ios10.3'};
    const preset = getPreset(null, {...baseOptions, ...options});

    const defaultPlugins = preset.overrides[1].plugins;
    const extraPlugins = preset.overrides[4].plugins;

    expect(defaultPlugins.length).toBe(10);
    expect(extraPlugins.length).toBe(9);

    expect(defaultPlugins.some(plugin => plugin[0] === transformBlockScoping)).toBe(false);
    expect(defaultPlugins.some(plugin => plugin[0] === transformRegenerator)).toBe(false);
    expect(extraPlugins.some(plugin => plugin[0] === transformTemplateLiterals)).toBe(false);
  });
});
