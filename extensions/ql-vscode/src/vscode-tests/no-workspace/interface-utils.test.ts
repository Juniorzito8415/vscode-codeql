import { describe, it, expect, jest, afterEach } from '@jest/globals';
import * as vscode from 'vscode';
import * as path from 'path';
import * as tmp from 'tmp';
import { window, ViewColumn, Uri, WebviewPanel } from 'vscode';
import {
  fileUriToWebviewUri,
  tryResolveLocation,
} from '../../interface-utils';
import { getDefaultResultSetName } from '../../pure/interface-types';
import { DatabaseItem } from '../../databases';
import { FileResult } from 'tmp';

describe('interface-utils', () => {
  describe('webview uri conversion', () => {
    const fileSuffix = '.bqrs';

    function setupWebview(filePrefix: string) {
      const tmpFile = tmp.fileSync({
        prefix: `uri_test_${filePrefix}_`,
        postfix: fileSuffix,
        keep: false,
      });
      const fileUriOnDisk = Uri.file(tmpFile.name);
      const panel = window.createWebviewPanel(
        'test panel',
        'test panel',
        ViewColumn.Beside,
        {
          enableScripts: false,
          localResourceRoots: [fileUriOnDisk],
        }
      );

      // CSP allowing nothing, to prevent warnings.
      const html = '<html><head><meta http-equiv="Content-Security-Policy" content="default-src \'none\';"></head></html>';
      panel.webview.html = html;
      return {
        fileUriOnDisk,
        panel,
        tmpFile,
      };
    }

    let webview: {
      fileUriOnDisk: Uri,
      panel: WebviewPanel,
      tmpFile: FileResult,
    };

    afterEach(() => {
      webview?.panel.dispose();
      webview?.tmpFile?.removeCallback();
    });

    it('does not double-encode # in URIs', () => {
      webview = setupWebview('#');
      const { fileUriOnDisk, panel } = webview;
      const webviewUri = fileUriToWebviewUri(panel, fileUriOnDisk);
      const parsedUri = Uri.parse(webviewUri);
      expect(path.basename(parsedUri.path, fileSuffix)).toBe(path.basename(fileUriOnDisk.path, fileSuffix));
    });
  });

  describe('getDefaultResultSetName', () => {
    it('should get the default name', () => {
      expect(getDefaultResultSetName(['a', 'b', '#select', 'alerts'])).toBe('alerts');
      expect(getDefaultResultSetName(['a', 'b', '#select'])).toBe('#select');
      expect(getDefaultResultSetName(['a', 'b'])).toBe('a');
      expect(getDefaultResultSetName([])).toBeUndefined();
    });
  });

  describe('resolveWholeFileLocation', () => {
    it('should resolve a whole file location', () => {
      const mockDatabaseItem: DatabaseItem = ({
        resolveSourceFile: () => vscode.Uri.file('abc'),
      } as unknown) as DatabaseItem;
      expect(
        tryResolveLocation(
          'file://hucairz:0:0:0:0',
          mockDatabaseItem
        )
      ).toEqual(new vscode.Location(
        vscode.Uri.file('abc'),
        new vscode.Range(0, 0, 0, 0)
      ));
    });

    it('should resolve a five-part location edge case', () => {
      const mockDatabaseItem: DatabaseItem = ({
        resolveSourceFile: () => vscode.Uri.file('abc'),
      } as unknown) as DatabaseItem;
      expect(
        tryResolveLocation(
          'file://hucairz:1:1:1:1',
          mockDatabaseItem
        )
      ).toEqual(new vscode.Location(
        vscode.Uri.file('abc'),
        new vscode.Range(0, 0, 0, 1)
      ));
    });

    it('should resolve a five-part location', () => {
      const mockDatabaseItem: DatabaseItem = ({
        resolveSourceFile: jest.fn().mockReturnValue(vscode.Uri.parse('abc')),
      } as unknown) as DatabaseItem;

      expect(
        tryResolveLocation(
          {
            startColumn: 1,
            endColumn: 3,
            startLine: 4,
            endLine: 5,
            uri: 'hucairz',
          },
          mockDatabaseItem
        )
      ).toEqual(new vscode.Location(
        vscode.Uri.parse('abc'),
        new vscode.Range(new vscode.Position(4, 3), new vscode.Position(3, 0))
      ));
      expect(mockDatabaseItem.resolveSourceFile).toHaveBeenCalledWith(
        'hucairz'
      );
      expect(mockDatabaseItem.resolveSourceFile).toHaveBeenCalledTimes(1);
    });

    it('should resolve a five-part location with an empty path', () => {
      const mockDatabaseItem: DatabaseItem = ({
        resolveSourceFile: jest.fn().mockReturnValue(vscode.Uri.parse('abc')),
      } as unknown) as DatabaseItem;

      expect(
        tryResolveLocation(
          {
            startColumn: 1,
            endColumn: 3,
            startLine: 4,
            endLine: 5,
            uri: '',
          },
          mockDatabaseItem
        )
      ).toBeUndefined();
    });

    it('should resolve a string location for whole file', () => {
      const mockDatabaseItem: DatabaseItem = ({
        resolveSourceFile: jest.fn().mockReturnValue(vscode.Uri.parse('abc')),
      } as unknown) as DatabaseItem;

      expect(
        tryResolveLocation(
          'file://hucairz:0:0:0:0',
          mockDatabaseItem
        )
      ).toEqual(new vscode.Location(
        vscode.Uri.parse('abc'),
        new vscode.Range(0, 0, 0, 0)
      ));
      expect(mockDatabaseItem.resolveSourceFile).toHaveBeenCalledWith(
        'hucairz'
      );
      expect(mockDatabaseItem.resolveSourceFile).toHaveBeenCalledTimes(1);
    });

    it('should resolve a string location for five-part location', () => {
      const mockDatabaseItem: DatabaseItem = ({
        resolveSourceFile: jest.fn().mockReturnValue(vscode.Uri.parse('abc')),
      } as unknown) as DatabaseItem;

      expect(
        tryResolveLocation(
          'file://hucairz:5:4:3:2',
          mockDatabaseItem
        )
      ).toEqual(new vscode.Location(
        vscode.Uri.parse('abc'),
        new vscode.Range(new vscode.Position(4, 3), new vscode.Position(2, 2))
      ));
      expect(mockDatabaseItem.resolveSourceFile).toHaveBeenCalledWith(
        'hucairz'
      );
      expect(mockDatabaseItem.resolveSourceFile).toHaveBeenCalledTimes(1);
    });

    it('should resolve a string location for invalid string', () => {
      const mockDatabaseItem: DatabaseItem = ({
        resolveSourceFile: () => vscode.Uri.parse('abc'),
      } as unknown) as DatabaseItem;

      expect(
        tryResolveLocation(
          'file://hucairz:x:y:z:a',
          mockDatabaseItem
        )
      ).toBeUndefined();
    });
  });
});
