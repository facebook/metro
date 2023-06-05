import path from 'path';
import fs from 'fs';
import * as url from 'url';
export function resolvePackageTargetsFromImports(specifier: string, parentURL, conditions){

  if (!specifier.startsWith('#')) {
    throw new Error("Specifier must start with '#'.");
  }

  if(specifier.startsWith('#/') || specifier === '#') {
    throw Error('Invalid Module Specifier.');
  }
  const packageURL = lookupParentScope(parentURL);

  if (packageURL) {
    const pjson = readPackageJSON(packageURL);

    // If pjson.imports is a non-null Object, then
    if (pjson.imports && typeof pjson.imports === 'object') {
      const resolved = packageImportsExportsResolver(specifier, pjson.imports, packageURL, true, conditions);

      // If resolved is not null or undefined, return resolved.
      if (resolved != null && typeof resolved !== 'undefined') {
        return resolved;
      }
    }

    throw new Error('Package Import Not Defined.');
  }
}

function lookupParentScope(url: string): string {
  let scopeURL = url;

  while (scopeURL !== path.parse(scopeURL).root) {
    scopeURL = path.dirname(scopeURL);

    // If scopeURL ends in a "node_modules" path segment, return null.
    if (scopeURL.endsWith('node_modules')) {
      return null;
    }

    const pjsonURL = path.resolve(scopeURL, 'package.json');

    // If the file at pjsonURL exists, then
    if (fs.existsSync(pjsonURL)) {
      return scopeURL;
    }
  }
  return null;
}

function readPackageJSON(url: string): string {
  const pjsonURL = path.resolve(packageURL, 'package.json');

  // If the file at pjsonURL does not exist, then
  if (!fs.existsSync(pjsonURL)) {
    return null;
  }

  try {
    // Parse JSON from file
    const packageJson = fs.readFileSync(pjsonURL, 'utf-8');
    const parsedJson = JSON.parse(packageJson);

    // If the file at pjsonURL does not parse as valid JSON, then
    // Throw an Invalid Package Configuration error.
    return parsedJson;
  } catch (e) {
    throw new Error('Invalid Package Configuration');
  }
}

function packageImportsExportsResolver(matchKey, matchObj, packageURL, isImports, conditions) {
  if (matchObj.hasOwnProperty(matchKey) && !matchKey.includes('*')) {
    const target = matchObj[matchKey];
    return packageTargetResolve(packageURL, target, null, isImports, conditions);
  }

  const expansionKeys = Object.keys(matchObj).filter(key => key.split('*').length - 1 === 1).sort(PATTERN_KEY_COMPARE);

  for (const expansionKey of expansionKeys) {
    const patternBase = expansionKey.split('*')[0];
    if (matchKey.startsWith(patternBase) && matchKey !== patternBase) {
      const patternTrailer = expansionKey.split('*')[1];
      if (patternTrailer.length === 0 || (matchKey.endsWith(patternTrailer) && matchKey.length >= expansionKey.length)) {
        const target = matchObj[expansionKey];
        const patternMatch = matchKey.substring(patternBase.length, matchKey.length - patternTrailer.length);
        return packageTargetResolve(packageURL, target, patternMatch, isImports, conditions);
      }
    }
  }

  return null;
}

function packageTargetResolve(packageURL, target, patternMatch, isImports, conditions) {
  if (typeof target === 'string') {
    if (!target.startsWith('./')) {
      if (!isImports || target.startsWith('../') || target.startsWith('/') || isValidURL(target)) {
        throw new Error('Invalid Package Target');
      }
    }

    if (patternMatch) {
      return packageResolve(target.replace(/\*/g, patternMatch), `${packageURL}/`);
    }

    return packageResolve(target, `${packageURL}/`);
  } else if (target && typeof target === 'object' && !Array.isArray(target)) {
    if (Object.keys(target).some(key => /^\d+$/.test(key))) {
      throw new Error('Invalid Package Configuration');
    }

    for (const p in target) {
      if (p === 'default' || conditions.includes(p)) {
        const targetValue = target[p];
        const resolved = packageTargetResolve(packageURL, targetValue, patternMatch, isImports, conditions);
        if (resolved != null) {
          return resolved;
        }
      }
    }

    return undefined;
  } else if (Array.isArray(target)) {
    if (target.length === 0) {
      return null;
    }

    for (const targetValue of target) {
      try {
        const resolved = packageTargetResolve(packageURL, targetValue, patternMatch, isImports, conditions);
        if (resolved != null) {
          return resolved;
        }
      } catch (e) {
        if (e.message !== 'Invalid Package Target') {
          throw e;
        }
      }
    }

    throw new Error('Invalid Package Target');
  } else if (target == null) {
    return null;
  }

  throw new Error('Invalid Package Target');
}

function isValidURL(str) {
  try {
    new URL(str);
    return true;
  } catch (e) {
    return false;
  }
}

function packageResolve(packageSpecifier, parentURL) {
  if (packageSpecifier === '') {
    throw new Error('Invalid Module Specifier');
  }

  if (isBuiltinModule(packageSpecifier)) {
    return `node:${packageSpecifier}`;
  }

  let packageName;
  if (!packageSpecifier.startsWith('@')) {
    packageName = packageSpecifier.split('/')[0];
  } else {
    if (!packageSpecifier.includes('/')) {
      throw new Error('Invalid Module Specifier');
    }
    packageName = packageSpecifier.split('/').slice(0, 2).join('/');
  }

  if (packageName.startsWith('.') || packageName.includes('\\') || packageName.includes('%')) {
    throw new Error('Invalid Module Specifier');
  }

  const packageSubpath = '.' + packageSpecifier.slice(packageName.length);

  if (packageSubpath.endsWith('/')) {
    throw new Error('Invalid Module Specifier');
  }

  const selfUrl = PackageSelfResolve(packageName, packageSubpath, parentURL);

  if (selfUrl != null) {
    return selfUrl;
  }

  while (parentURL !== path.parse(parentURL).root) {
    const packageURL = url.resolve(parentURL, `node_modules/${packageSpecifier}`);
    parentURL = path.dirname(parentURL);

    if (!fs.existsSync(packageURL)) {
      continue;
    }

    const pjson = readPackageJSON(packageURL);

    if (pjson != null && pjson.exports != null) {
      return PackageExportsResolve(packageURL, packageSubpath, pjson.exports, ['default']);
    } else if (packageSubpath === '.') {
      if (typeof pjson.main === 'string') {
        return url.resolve(packageURL, pjson.main);
      } else {
        return url.resolve(packageURL, packageSubpath);
      }
    }
  }

  throw new Error('Module Not Found');
}

function isBuiltinModule(moduleName) {
  // Check if moduleName is a Node.js builtin module
  return require('module').builtinModules.includes(moduleName);
}

function PackageSelfResolve(packageName, packageSubpath, parentURL) {
  const packageURL = lookupParentScope(parentURL);
  if (packageURL == null) {
    return undefined;
  }
  const pjson = readPackageJSON(packageURL);
  if (pjson == null || pjson.exports == null || pjson.exports == null) {
    return undefined;
  }
  if (pjson.name === packageName) {
    return PackageExportsResolve(packageURL, packageSubpath, pjson.exports, defaultConditions);
  }
  return undefined;
}

function PackageExportsResolve(packageURL, subpath, exports, conditions) {
  if (typeof exports === 'object' && Object.keys(exports).some(key => key.startsWith('.')) && Object.keys(exports).some(key => !key.startsWith('.'))) {
    throw new Error('Invalid Package Configuration');
  }

  if (subpath === '.') {
    let mainExport = undefined;

    if (typeof exports === 'string' || Array.isArray(exports) || (typeof exports === 'object' && !Object.keys(exports).some(key => key.startsWith('.')))) {
      mainExport = exports;
    } else if (typeof exports === 'object' && exports.hasOwnProperty('.')) {
      mainExport = exports['.'];
    }

    if (mainExport != null) {
      const resolved = packageTargetResolve(packageURL, mainExport, null, false, conditions);
      if (resolved != null && resolved != null) {
        return resolved;
      }
    }
  } else if (typeof exports === 'object' && Object.keys(exports).every(key => key.startsWith('.'))) {
    const matchKey = './' + subpath;
    const resolved = packageImportsExportsResolver(matchKey, exports, packageURL, false, conditions);
    if (resolved != null && resolved != null) {
      return resolved;
    }
  }

  throw new Error('Package Path Not Exported');
}
