import crypto from 'crypto';
import path from 'path';
import type {
  RequireContextParams,
} from '../ModuleGraph/worker/collectDependencies';
import type {
  RequireContext,
} from '../DeltaBundler/types.flow';


/** Convert a JSON context into an object. */
export function toRequireContext(context: RequireContextParams): string {
  return {
    ...context,
    filter: new RegExp(context.filter.pattern, context.filter.flags)
  }
}

/** Get an ID for a context module. */
export function getContextModuleId(modulePath: string, context: RequireContext): string {
    // Similar to other `require.context` implementations.
    return [
      modulePath,
      context.mode,
      context.recursive ? 'recursive' : '',
      context.filter.toString(),
    ]
      .filter(Boolean)
      .join(' ');
}

function toHash(value: string): string {
  // Use `hex` to ensure filepath safety.
  return crypto.createHash('sha1').update(value).digest('hex');
}

/** Given a virtualized path, strip the virtual component and return a path that could be real. */
export function removeContextQueryParam(virtualFilePath: string): string {
  const [filepath] = virtualFilePath.split('?ctx=');
  return filepath;
}

/** Given a path and a require context, return a virtual file path that ensures uniqueness between paths with different contexts. */
export function appendContextQueryParam(filePath: string, context: RequireContext): string {
  // Drop the trailing slash, require.context should always be matched against a folder
  // and we want to normalize the folder name as much as possible to prevent duplicates.
  // This also makes the files show up in the correct location when debugging in Chrome.
  filePath = filePath.endsWith('/') ? filePath.slice(0, -1) : filePath;
  return filePath + '?ctx=' + toHash(getContextModuleId(filePath, context));
}

/** Match a file against a require context. */
export function fileMatchesContext(
    inputPath: string,
    testPath: string,
    context: $ReadOnly<{
      /* Should search for files recursively. */
      recursive: boolean,
      /* Filter relative paths against a pattern. */
      filter: RegExp,
    }>,
) {
    // NOTE(EvanBacon): Ensure this logic is synchronized with the similar 
    // functionality in `metro-file-map/src/HasteFS.js` (`matchFilesWithContext()`)

    const filePath = path.relative(inputPath, testPath);

    if (
      // Ignore everything outside of the provided `root`.
      !(filePath && !filePath.startsWith('..') && !path.isAbsolute(filePath)) ||
      // Prevent searching in child directories during a non-recursive search.
      (!context.recursive && filePath.includes(path.sep)) ||
      // Test against the filter.
      !context.filter.test(
        // NOTE(EvanBacon): Ensure files start with `./` for matching purposes
        // this ensures packages work across Metro and Webpack (ex: Storybook for React DOM / React Native).
        // `a/b.js` -> `./a/b.js`
        '.' + path.sep + filePath,
      )
    ) {
      return false;
    }

    return true;
  } 