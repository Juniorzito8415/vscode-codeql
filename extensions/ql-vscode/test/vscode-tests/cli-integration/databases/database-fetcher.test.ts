import { join } from "path";
import { Uri, window } from "vscode";

import type { CodeQLCliServer } from "../../../../src/codeql-cli/cli";
import type { DatabaseManager } from "../../../../src/databases/local-databases";
import { DatabaseFetcher } from "../../../../src/databases/database-fetcher";
import {
  cleanDatabases,
  dbLoc,
  DB_URL,
  getActivatedExtension,
  storagePath,
} from "../../global.helper";
import { createMockCommandManager } from "../../../__mocks__/commandsMock";
import { remove } from "fs-extra";

/**
 * Run various integration tests for databases
 */
describe("database-fetcher", () => {
  let databaseManager: DatabaseManager;
  let inputBoxStub: jest.SpiedFunction<typeof window.showInputBox>;
  let cli: CodeQLCliServer;
  const progressCallback = jest.fn();

  beforeEach(async () => {
    inputBoxStub = jest
      .spyOn(window, "showInputBox")
      .mockResolvedValue(undefined);

    jest.spyOn(window, "showErrorMessage").mockResolvedValue(undefined);
    jest.spyOn(window, "showInformationMessage").mockResolvedValue(undefined);

    const extension = await getActivatedExtension();
    databaseManager = extension.databaseManager;
    cli = extension.cliServer;

    await cleanDatabases(databaseManager);
  });

  afterEach(async () => {
    await cleanDatabases(databaseManager);
    await remove(storagePath);
  });

  describe("importArchiveDatabase", () => {
    it("should add a database from a folder", async () => {
      const uri = Uri.file(dbLoc);
      let dbItem = await new DatabaseFetcher().importArchiveDatabase(
        createMockCommandManager(),
        uri.toString(true),
        databaseManager,
        storagePath,
        progressCallback,
        cli,
      );
      expect(dbItem).toBe(databaseManager.currentDatabaseItem);
      expect(dbItem).toBe(databaseManager.databaseItems[0]);
      expect(dbItem).toBeDefined();
      dbItem = dbItem!;
      expect(dbItem.name).toBe("db");
      expect(dbItem.databaseUri.fsPath).toBe(join(storagePath, "db", "db"));
    });
  });

  describe("promptImportInternetDatabase", () => {
    it("should add a database from a url", async () => {
      // Provide a database URL when prompted
      inputBoxStub.mockResolvedValue(DB_URL);

      let dbItem = await new DatabaseFetcher().promptImportInternetDatabase(
        createMockCommandManager(),
        databaseManager,
        storagePath,
        progressCallback,
        cli,
      );
      expect(dbItem).toBeDefined();
      dbItem = dbItem!;
      expect(dbItem.name).toBe("db");
      expect(dbItem.databaseUri.fsPath).toBe(
        join(storagePath, "simple-db", "db"),
      );
    });
  });
});
