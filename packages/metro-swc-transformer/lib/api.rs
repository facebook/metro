/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

use std::collections::HashMap;
use std::path::PathBuf;

use serde::Deserialize;
use serde::Serialize;
use swc::atoms::JsWordStaticSet;

#[derive(Serialize, Deserialize)]
pub struct MetroJSTransformerInput {
  pub code: String,
  pub file_name: Option<PathBuf>,
  pub global_prefix: Option<String>,
}

pub type DependencyMap = HashMap<DependencyKey, Dependency>;

#[derive(Serialize, Deserialize)]
pub struct MetroJSTransformerResult {
  pub code: String,
  pub dependencies: DependencyMap,
  pub dependency_map_ident: String,
}

#[derive(Serialize, Deserialize)]
pub struct Dependency {
  pub index: usize,
}

#[derive(PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
pub struct DependencyKey {
  pub specifier: string_cache::Atom<JsWordStaticSet>,
}
