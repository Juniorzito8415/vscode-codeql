import type { AuthenticationSession } from "vscode";
import { authentication } from "vscode";
import type { Octokit } from "@octokit/rest";
import type { Credentials } from "../authentication";
import { AppOctokit } from "../octokit";
import { VSCODE_GITHUB_ENTERPRISE_URI_SETTING } from "../../config";

export const GITHUB_AUTH_PROVIDER_ID = "github";

// We need 'repo' scope for triggering workflows, 'gist' scope for exporting results to Gist,
// and 'read:packages' for reading private CodeQL packages.
// For a comprehensive list of scopes, see:
// https://docs.github.com/apps/building-oauth-apps/understanding-scopes-for-oauth-apps
const SCOPES = ["repo", "gist", "read:packages"];

enum AuthProvider {
  github = "github",
  githubEnterprise = "github-enterprise",
}

/**
 * Handles authentication to GitHub, using the VS Code [authentication API](https://code.visualstudio.com/api/references/vscode-api#authentication).
 */
export class VSCodeCredentials implements Credentials {
  /**
   * A specific octokit to return, otherwise a new authenticated octokit will be created when needed.
   */
  private octokit: Octokit | undefined;

  /**
   * Creates or returns an instance of Octokit.
   *
   * @returns An instance of Octokit.
   */
  async getOctokit(): Promise<Octokit> {
    if (this.octokit) {
      return this.octokit;
    }

    const accessToken = await this.getAccessToken();

    return new AppOctokit({
      auth: accessToken,
    });
  }

  async getAccessToken(): Promise<string> {
    return (await this.getSession(true)).accessToken;
  }

  async getExistingAccessToken(): Promise<string | undefined> {
    return (await this.getSession(false))?.accessToken;
  }

  private async getSession(createIfNone: true): Promise<AuthenticationSession>;
  private async getSession(
    createIfNone: false,
  ): Promise<AuthenticationSession | undefined>;

  private async getSession(
    createIfNone: boolean,
  ): Promise<AuthenticationSession | undefined> {
    const authProviderId = VSCODE_GITHUB_ENTERPRISE_URI_SETTING.getValue()
      ? AuthProvider.githubEnterprise
      : AuthProvider.github;
    return await authentication.getSession(authProviderId, SCOPES, {
      createIfNone,
    });
  }
}
