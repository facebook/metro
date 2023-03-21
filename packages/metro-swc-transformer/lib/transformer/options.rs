use swc::config::{Config, JsMinifyOptions, JscConfig, ModuleConfig, Options, TransformConfig};
use swc_config::config_types::{BoolConfig, BoolOrDataConfig};
use swc_ecma_parser::{EsConfig, Syntax, TsConfig};
use swc_ecma_transforms_module as module;
use swc_ecma_transforms_react as react;
use swc_ecma_utils::swc_ecma_ast::EsVersion;

fn get_module_config() -> ModuleConfig {
  let module_config = ModuleConfig::CommonJs(module::common_js::Config {
    strict: false,
    strict_mode: false,
    no_interop: false,
    ..Default::default()
  });
  module_config
}

pub fn get_config_options(is_typescript: bool) -> Options {
  let syntax = match is_typescript {
    true => Syntax::Typescript(TsConfig {
      tsx: true,
      ..Default::default()
    }),
    false => Syntax::Es(EsConfig {
      jsx: true,
      ..Default::default()
    }),
  };

  let opts = &Options {
    config: Config {
      jsc: JscConfig {
        loose: BoolConfig::new(Some(false)),
        target: Some(EsVersion::Es5),
        syntax: Some(syntax),
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
      module: Some(get_module_config()),
      ..Default::default()
    },
    ..Default::default()
  };

  opts.clone()
}
