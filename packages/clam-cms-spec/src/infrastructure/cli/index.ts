/**
 * `infrastructure/cli/` — file-walking, console I/O, and process-exit
 * adapter for the validate use case. Thin wrapper: load files →
 * construct request DTO → call use case → format response.
 */
export { run, parseArgs, type CliArgs } from "./ValidateCommand.js";
