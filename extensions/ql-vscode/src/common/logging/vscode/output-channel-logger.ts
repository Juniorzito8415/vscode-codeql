import { window as Window, OutputChannel, Progress } from "vscode";
import * as fs from "fs-extra";
import * as path from "path";
import { Logger, LogOptions } from "../logger";
import { DisposableObject } from "../../../pure/disposable-object";

/** A logger that writes messages to an output channel in the Output tab. */
export class OutputChannelLogger extends DisposableObject implements Logger {
  public readonly outputChannel: OutputChannel;
  private readonly additionalLocations = new Map<
    string,
    AdditionalLogLocation
  >();
  isCustomLogDirectory: boolean;

  constructor(title: string) {
    super();
    this.outputChannel = Window.createOutputChannel(title);
    this.push(this.outputChannel);
    this.isCustomLogDirectory = false;
  }

  /**
   * This function is asynchronous and will only resolve once the message is written
   * to the side log (if required). It is not necessary to await the results of this
   * function if you don't need to guarantee that the log writing is complete before
   * continuing.
   */
  async log(message: string, options = {} as LogOptions): Promise<void> {
    try {
      if (options.trailingNewline === undefined) {
        options.trailingNewline = true;
      }
      if (options.trailingNewline) {
        this.outputChannel.appendLine(message);
      } else {
        this.outputChannel.append(message);
      }

      if (options.additionalLogLocation) {
        if (!path.isAbsolute(options.additionalLogLocation)) {
          throw new Error(
            `Additional Log Location must be an absolute path: ${options.additionalLogLocation}`,
          );
        }
        const logPath = options.additionalLogLocation;
        let additional = this.additionalLocations.get(logPath);
        if (!additional) {
          const msg = `| Log being saved to ${logPath} |`;
          const separator = new Array(msg.length).fill("-").join("");
          this.outputChannel.appendLine(separator);
          this.outputChannel.appendLine(msg);
          this.outputChannel.appendLine(separator);
          additional = new AdditionalLogLocation(logPath);
          this.additionalLocations.set(logPath, additional);
        }

        await additional.log(message, options);
      }
    } catch (e) {
      if (e instanceof Error && e.message === "Channel has been closed") {
        // Output channel is closed logging to console instead
        console.log(
          "Output channel is closed logging to console instead:",
          message,
        );
      } else {
        throw e;
      }
    }
  }

  show(preserveFocus?: boolean): void {
    this.outputChannel.show(preserveFocus);
  }

  removeAdditionalLogLocation(location: string | undefined): void {
    if (location) {
      this.additionalLocations.delete(location);
    }
  }
}

class AdditionalLogLocation {
  constructor(private location: string) {
    /**/
  }

  async log(message: string, options = {} as LogOptions): Promise<void> {
    if (options.trailingNewline === undefined) {
      options.trailingNewline = true;
    }
    await fs.ensureFile(this.location);

    await fs.appendFile(
      this.location,
      message + (options.trailingNewline ? "\n" : ""),
      {
        encoding: "utf8",
      },
    );
  }
}

export type ProgressReporter = Progress<{ message: string }>;