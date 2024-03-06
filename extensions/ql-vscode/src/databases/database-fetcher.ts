import type { Response } from "node-fetch";
import fetch, { AbortError } from "node-fetch";
import { zip } from "zip-a-folder";
import type { InputBoxOptions } from "vscode";
import { Uri, window } from "vscode";
import type { CodeQLCliServer } from "../codeql-cli/cli";
import {
  ensureDir,
  realpath as fs_realpath,
  pathExists,
  createWriteStream,
  remove,
  stat,
  readdir,
} from "fs-extra";
import { basename, join } from "path";
import type { Octokit } from "@octokit/rest";

import type { DatabaseManager, DatabaseItem } from "./local-databases";
import { tmpDir } from "../tmp-dir";
import type { ProgressCallback } from "../common/vscode/progress";
import { reportStreamProgress } from "../common/vscode/progress";
import { extLogger } from "../common/logging/vscode";
import { getErrorMessage } from "../common/helpers-pure";
import {
  getNwoFromGitHubUrl,
  isValidGitHubNwo,
} from "../common/github-url-identifier-helper";
import type { AppCommandManager } from "../common/commands";
import {
  addDatabaseSourceToWorkspace,
  allowHttp,
  downloadTimeout,
  isCanary,
} from "../config";
import { showAndLogInformationMessage } from "../common/logging";
import { AppOctokit } from "../common/octokit";
import { getLanguageDisplayName } from "../common/query-language";
import type { DatabaseOrigin } from "./local-databases/database-origin";
import { createTimeoutSignal } from "../common/fetch-stream";
import type { App } from "../common/app";

/**
 * Prompts a user to fetch a database from a remote location. Database is assumed to be an archive file.
 *
 * @param databaseManager the DatabaseManager
 * @param storagePath where to store the unzipped database.
 */
export async function promptImportInternetDatabase(
  commandManager: AppCommandManager,
  databaseManager: DatabaseManager,
  storagePath: string,
  progress: ProgressCallback,
  cli: CodeQLCliServer,
): Promise<DatabaseItem | undefined> {
  const databaseUrl = await window.showInputBox({
    prompt: "Enter URL of zipfile of database to download",
  });
  if (!databaseUrl) {
    return;
  }

  validateUrl(databaseUrl);

  const item = await databaseArchiveFetcher(
    databaseUrl,
    {},
    databaseManager,
    storagePath,
    undefined,
    {
      type: "url",
      url: databaseUrl,
    },
    progress,
    cli,
  );

  if (item) {
    await commandManager.execute("codeQLDatabases.focus");
    void showAndLogInformationMessage(
      extLogger,
      "Database downloaded and imported successfully.",
    );
  }
  return item;
}

/**
 * Prompts a user to fetch a database from GitHub.
 * User enters a GitHub repository and then the user is asked which language
 * to download (if there is more than one)
 *
 * @param app the App
 * @param databaseManager the DatabaseManager
 * @param storagePath where to store the unzipped database.
 * @param progress the progress callback
 * @param cli the CodeQL CLI server
 * @param language the language to download. If undefined, the user will be prompted to choose a language.
 * @param makeSelected make the new database selected in the databases panel (default: true)
 * @param addSourceArchiveFolder whether to add a workspace folder containing the source archive to the workspace
 */
export async function promptImportGithubDatabase(
  app: App,
  databaseManager: DatabaseManager,
  storagePath: string,
  progress: ProgressCallback,
  cli: CodeQLCliServer,
  language?: string,
  makeSelected = true,
  addSourceArchiveFolder = addDatabaseSourceToWorkspace(),
): Promise<DatabaseItem | undefined> {
  const githubRepo = await askForGitHubRepo(progress);
  if (!githubRepo) {
    return;
  }

  const databaseItem = await downloadGitHubDatabase(
    githubRepo,
    app,
    databaseManager,
    storagePath,
    progress,
    cli,
    language,
    makeSelected,
    addSourceArchiveFolder,
  );

  if (databaseItem) {
    if (makeSelected) {
      await app.commands.execute("codeQLDatabases.focus");
    }
    void showAndLogInformationMessage(
      extLogger,
      "Database downloaded and imported successfully.",
    );
    return databaseItem;
  }

  return;
}

export async function askForGitHubRepo(
  progress?: ProgressCallback,
  suggestedValue?: string,
): Promise<string | undefined> {
  progress?.({
    message: "Choose repository",
    step: 1,
    maxStep: 2,
  });

  const options: InputBoxOptions = {
    title:
      'Enter a GitHub repository URL or "name with owner" (e.g. https://github.com/github/codeql or github/codeql)',
    placeHolder: "https://github.com/<owner>/<repo> or <owner>/<repo>",
    ignoreFocusOut: true,
  };

  if (suggestedValue) {
    options.value = suggestedValue;
  }

  return await window.showInputBox(options);
}

/**
 * Downloads a database from GitHub
 *
 * @param githubRepo the GitHub repository to download the database from
 * @param app the App
 * @param databaseManager the DatabaseManager
 * @param storagePath where to store the unzipped database.
 * @param progress the progress callback
 * @param cli the CodeQL CLI server
 * @param language the language to download. If undefined, the user will be prompted to choose a language.
 * @param makeSelected make the new database selected in the databases panel (default: true)
 * @param addSourceArchiveFolder whether to add a workspace folder containing the source archive to the workspace
 **/
export async function downloadGitHubDatabase(
  githubRepo: string,
  app: App,
  databaseManager: DatabaseManager,
  storagePath: string,
  progress: ProgressCallback,
  cli: CodeQLCliServer,
  language?: string,
  makeSelected = true,
  addSourceArchiveFolder = addDatabaseSourceToWorkspace(),
): Promise<DatabaseItem | undefined> {
  const nwo = getNwoFromGitHubUrl(githubRepo) || githubRepo;
  if (!isValidGitHubNwo(nwo)) {
    throw new Error(`Invalid GitHub repository: ${githubRepo}`);
  }

  const credentials = isCanary() ? app.credentials : undefined;

  const octokit = credentials
    ? await credentials.getOctokit()
    : new AppOctokit();

  const result = await convertGithubNwoToDatabaseUrl(
    nwo,
    octokit,
    progress,
    language,
  );
  if (!result) {
    return;
  }

  const { databaseUrl, name, owner, databaseId, databaseCreatedAt, commitOid } =
    result;

  return downloadGitHubDatabaseFromUrl(
    databaseUrl,
    databaseId,
    databaseCreatedAt,
    commitOid,
    owner,
    name,
    octokit,
    progress,
    databaseManager,
    storagePath,
    cli,
    makeSelected,
    addSourceArchiveFolder,
  );
}

export async function downloadGitHubDatabaseFromUrl(
  databaseUrl: string,
  databaseId: number,
  databaseCreatedAt: string,
  commitOid: string | null,
  owner: string,
  name: string,
  octokit: Octokit,
  progress: ProgressCallback,
  databaseManager: DatabaseManager,
  storagePath: string,
  cli: CodeQLCliServer,
  makeSelected = true,
  addSourceArchiveFolder = true,
): Promise<DatabaseItem | undefined> {
  /**
   * The 'token' property of the token object returned by `octokit.auth()`.
   * The object is undocumented, but looks something like this:
   * {
   *   token: 'xxxx',
   *   tokenType: 'oauth',
   *   type: 'token',
   * }
   * We only need the actual token string.
   */
  const octokitToken = ((await octokit.auth()) as { token: string })?.token;
  return await databaseArchiveFetcher(
    databaseUrl,
    {
      Accept: "application/zip",
      Authorization: octokitToken ? `Bearer ${octokitToken}` : "",
    },
    databaseManager,
    storagePath,
    `${owner}/${name}`,
    {
      type: "github",
      repository: `${owner}/${name}`,
      databaseId,
      databaseCreatedAt,
      commitOid,
    },
    progress,
    cli,
    makeSelected,
    addSourceArchiveFolder,
  );
}

/**
 * Imports a database from a local archive.
 *
 * @param databaseUrl the file url of the archive to import
 * @param databaseManager the DatabaseManager
 * @param storagePath where to store the unzipped database.
 * @param cli the CodeQL CLI server
 */
export async function importArchiveDatabase(
  commandManager: AppCommandManager,
  databaseUrl: string,
  databaseManager: DatabaseManager,
  storagePath: string,
  progress: ProgressCallback,
  cli: CodeQLCliServer,
): Promise<DatabaseItem | undefined> {
  try {
    const item = await databaseArchiveFetcher(
      databaseUrl,
      {},
      databaseManager,
      storagePath,
      undefined,
      {
        type: "archive",
        path: databaseUrl,
      },
      progress,
      cli,
    );
    if (item) {
      await commandManager.execute("codeQLDatabases.focus");
      void showAndLogInformationMessage(
        extLogger,
        "Database unzipped and imported successfully.",
      );
    }
    return item;
  } catch (e) {
    if (getErrorMessage(e).includes("unexpected end of file")) {
      throw new Error(
        "Database is corrupt or too large. Try unzipping outside of VS Code and importing the unzipped folder instead.",
      );
    } else {
      // delegate
      throw e;
    }
  }
}

/**
 * Fetches an archive database. The database might be on the internet
 * or in the local filesystem.
 *
 * @param databaseUrl URL from which to grab the database
 * @param requestHeaders Headers to send with the request
 * @param databaseManager the DatabaseManager
 * @param storagePath where to store the unzipped database.
 * @param nameOverride a name for the database that overrides the default
 * @param origin the origin of the database
 * @param progress callback to send progress messages to
 * @param cli the CodeQL CLI server
 * @param makeSelected make the new database selected in the databases panel (default: true)
 * @param addSourceArchiveFolder whether to add a workspace folder containing the source archive to the workspace
 */
async function databaseArchiveFetcher(
  databaseUrl: string,
  requestHeaders: { [key: string]: string },
  databaseManager: DatabaseManager,
  storagePath: string,
  nameOverride: string | undefined,
  origin: DatabaseOrigin,
  progress: ProgressCallback,
  cli: CodeQLCliServer,
  makeSelected = true,
  addSourceArchiveFolder = addDatabaseSourceToWorkspace(),
): Promise<DatabaseItem> {
  progress({
    message: "Getting database",
    step: 1,
    maxStep: 4,
  });
  if (!storagePath) {
    throw new Error("No storage path specified.");
  }
  await ensureDir(storagePath);
  const unzipPath = await getStorageFolder(storagePath, databaseUrl);

  if (isFile(databaseUrl)) {
    await readAndUnzip(databaseUrl, unzipPath, cli, progress);
  } else {
    await fetchAndUnzip(databaseUrl, requestHeaders, unzipPath, cli, progress);
  }

  progress({
    message: "Opening database",
    step: 3,
    maxStep: 4,
  });

  // find the path to the database. The actual database might be in a sub-folder
  const dbPath = await findDirWithFile(
    unzipPath,
    ".dbinfo",
    "codeql-database.yml",
  );
  if (dbPath) {
    progress({
      message: "Validating and fixing source location",
      step: 4,
      maxStep: 4,
    });
    await ensureZippedSourceLocation(dbPath);

    const item = await databaseManager.openDatabase(
      Uri.file(dbPath),
      origin,
      makeSelected,
      nameOverride,
      {
        addSourceArchiveFolder,
      },
    );
    return item;
  } else {
    throw new Error("Database not found in archive.");
  }
}

async function getStorageFolder(storagePath: string, urlStr: string) {
  // we need to generate a folder name for the unzipped archive,
  // this needs to be human readable since we may use this name as the initial
  // name for the database
  const url = Uri.parse(urlStr);
  // MacOS has a max filename length of 255
  // and remove a few extra chars in case we need to add a counter at the end.
  let lastName = basename(url.path).substring(0, 250);
  if (lastName.endsWith(".zip")) {
    lastName = lastName.substring(0, lastName.length - 4);
  }

  const realpath = await fs_realpath(storagePath);
  let folderName = join(realpath, lastName);

  // avoid overwriting existing folders
  let counter = 0;
  while (await pathExists(folderName)) {
    counter++;
    folderName = join(realpath, `${lastName}-${counter}`);
    if (counter > 100) {
      throw new Error("Could not find a unique name for downloaded database.");
    }
  }
  return folderName;
}

function validateUrl(databaseUrl: string) {
  let uri;
  try {
    uri = Uri.parse(databaseUrl, true);
  } catch (e) {
    throw new Error(`Invalid url: ${databaseUrl}`);
  }

  if (!allowHttp() && uri.scheme !== "https") {
    throw new Error("Must use https for downloading a database.");
  }
}

async function readAndUnzip(
  zipUrl: string,
  unzipPath: string,
  cli: CodeQLCliServer,
  progress?: ProgressCallback,
) {
  const zipFile = Uri.parse(zipUrl).fsPath;
  progress?.({
    maxStep: 10,
    step: 9,
    message: `Unzipping into ${basename(unzipPath)}`,
  });

  await cli.databaseUnbundle(zipFile, unzipPath);
}

async function fetchAndUnzip(
  databaseUrl: string,
  requestHeaders: { [key: string]: string },
  unzipPath: string,
  cli: CodeQLCliServer,
  progress?: ProgressCallback,
) {
  // Although it is possible to download and stream directly to an unzipped directory,
  // we need to avoid this for two reasons. The central directory is located at the
  // end of the zip file. It is the source of truth of the content locations. Individual
  // file headers may be incorrect. Additionally, saving to file first will reduce memory
  // pressure compared with unzipping while downloading the archive.

  const archivePath = join(tmpDir.name, `archive-${Date.now()}.zip`);

  progress?.({
    maxStep: 3,
    message: "Downloading database",
    step: 1,
  });

  const {
    signal,
    onData,
    dispose: disposeTimeout,
  } = createTimeoutSignal(downloadTimeout());

  let response: Response;
  try {
    response = await checkForFailingResponse(
      await fetch(databaseUrl, {
        headers: requestHeaders,
        signal,
      }),
      "Error downloading database",
    );
  } catch (e) {
    disposeTimeout();

    if (e instanceof AbortError) {
      const thrownError = new AbortError("The request timed out.");
      thrownError.stack = e.stack;
      throw thrownError;
    }

    throw e;
  }

  const archiveFileStream = createWriteStream(archivePath);

  const contentLength = response.headers.get("content-length");
  const totalNumBytes = contentLength ? parseInt(contentLength, 10) : undefined;
  reportStreamProgress(
    response.body,
    "Downloading database",
    totalNumBytes,
    progress,
  );

  response.body.on("data", onData);

  try {
    await new Promise((resolve, reject) => {
      response.body
        .pipe(archiveFileStream)
        .on("finish", resolve)
        .on("error", reject);

      // If an error occurs on the body, we also want to reject the promise (e.g. during a timeout error).
      response.body.on("error", reject);
    });
  } catch (e) {
    // Close and remove the file if an error occurs
    archiveFileStream.close(() => {
      void remove(archivePath);
    });

    if (e instanceof AbortError) {
      const thrownError = new AbortError("The download timed out.");
      thrownError.stack = e.stack;
      throw thrownError;
    }

    throw e;
  } finally {
    disposeTimeout();
  }

  await readAndUnzip(
    Uri.file(archivePath).toString(true),
    unzipPath,
    cli,
    progress,
  );

  // remove archivePath eagerly since these archives can be large.
  await remove(archivePath);
}

async function checkForFailingResponse(
  response: Response,
  errorMessage: string,
): Promise<Response | never> {
  if (response.ok) {
    return response;
  }

  // An error downloading the database. Attempt to extract the reason behind it.
  const text = await response.text();
  let msg: string;
  try {
    const obj = JSON.parse(text);
    msg =
      obj.error || obj.message || obj.reason || JSON.stringify(obj, null, 2);
  } catch (e) {
    msg = text;
  }
  throw new Error(`${errorMessage}.\n\nReason: ${msg}`);
}

function isFile(databaseUrl: string) {
  return Uri.parse(databaseUrl).scheme === "file";
}

/**
 * Recursively looks for a file in a directory. If the file exists, then returns the directory containing the file.
 *
 * @param dir The directory to search
 * @param toFind The file to recursively look for in this directory
 *
 * @returns the directory containing the file, or undefined if not found.
 */
// exported for testing
export async function findDirWithFile(
  dir: string,
  ...toFind: string[]
): Promise<string | undefined> {
  if (!(await stat(dir)).isDirectory()) {
    return;
  }
  const files = await readdir(dir);
  if (toFind.some((file) => files.includes(file))) {
    return dir;
  }
  for (const file of files) {
    const newPath = join(dir, file);
    const result = await findDirWithFile(newPath, ...toFind);
    if (result) {
      return result;
    }
  }
  return;
}

export async function convertGithubNwoToDatabaseUrl(
  nwo: string,
  octokit: Octokit,
  progress: ProgressCallback,
  language?: string,
): Promise<
  | {
      databaseUrl: string;
      owner: string;
      name: string;
      databaseId: number;
      databaseCreatedAt: string;
      commitOid: string | null;
    }
  | undefined
> {
  try {
    const [owner, repo] = nwo.split("/");

    const response = await octokit.rest.codeScanning.listCodeqlDatabases({
      owner,
      repo,
    });

    const languages = response.data.map((db) => db.language);

    if (!language || !languages.includes(language)) {
      language = await promptForLanguage(languages, progress);
      if (!language) {
        return;
      }
    }

    const databaseForLanguage = response.data.find(
      (db) => db.language === language,
    );
    if (!databaseForLanguage) {
      throw new Error(`No database found for language '${language}'`);
    }

    return {
      databaseUrl: databaseForLanguage.url,
      owner,
      name: repo,
      databaseId: databaseForLanguage.id,
      databaseCreatedAt: databaseForLanguage.created_at,
      commitOid: databaseForLanguage.commit_oid ?? null,
    };
  } catch (e) {
    void extLogger.log(`Error: ${getErrorMessage(e)}`);
    throw new Error(`Unable to get database for '${nwo}'`);
  }
}

export async function promptForLanguage(
  languages: string[],
  progress: ProgressCallback | undefined,
): Promise<string | undefined> {
  progress?.({
    message: "Choose language",
    step: 2,
    maxStep: 2,
  });
  if (!languages.length) {
    throw new Error("No databases found");
  }
  if (languages.length === 1) {
    return languages[0];
  }

  const items = languages
    .map((language) => ({
      label: getLanguageDisplayName(language),
      description: language,
      language,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));

  const selectedItem = await window.showQuickPick(items, {
    placeHolder: "Select the database language to download:",
    ignoreFocusOut: true,
  });
  if (!selectedItem) {
    return undefined;
  }

  return selectedItem.language;
}

/**
 * Databases created by the old odasa tool will not have a zipped
 * source location. However, this extension works better if sources
 * are zipped.
 *
 * This function ensures that the source location is zipped. If the
 * `src` folder exists and the `src.zip` file does not, the `src`
 * folder will be zipped and then deleted.
 *
 * @param databasePath The full path to the unzipped database
 */
async function ensureZippedSourceLocation(databasePath: string): Promise<void> {
  const srcFolderPath = join(databasePath, "src");
  const srcZipPath = `${srcFolderPath}.zip`;

  if ((await pathExists(srcFolderPath)) && !(await pathExists(srcZipPath))) {
    await zip(srcFolderPath, srcZipPath);
    await remove(srcFolderPath);
  }
}
