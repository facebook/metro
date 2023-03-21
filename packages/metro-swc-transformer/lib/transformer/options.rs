use swc::config::{Config, JsMinifyOptions, JscConfig, ModuleConfig, Options, TransformConfig};
use swc_config::config_types::{BoolConfig, BoolOrDataConfig};
use swc_ecma_parser::{EsConfig, Syntax};
use swc_ecma_transforms_react as react;
use swc_ecma_utils::swc_ecma_ast::EsVersion;

pub fn get_config_options() -> Options {
  let opts = &Options {
    config: Config {
      jsc: JscConfig {
        loose: BoolConfig::new(Some(false)),
        target: Some(EsVersion::Es5),
        syntax: Some(Syntax::Es(EsConfig {
          jsx: true,
          ..Default::default()
        })),
        minify: Some(JsMinifyOptions {
          compress: BoolOrDataConfig::from_bool(false),
          mangle: BoolOrDataConfig::from_bool(false),
          ..Default::default()
        }),
        transform: Some(TransformConfig {
          react: react::Options {
            runtime: Some(react::Runtime::Automatic),
            refresh: Some(react::RefreshOptions::default()),
            development: Some(true),
            ..Default::default()
          },
          ..Default::default()
        })
        .into(),
        ..Default::default()
      },
      module: Some(ModuleConfig::CommonJs(Default::default())),
      ..Default::default()
    },
    ..Default::default()
  };

  opts.clone()
}
