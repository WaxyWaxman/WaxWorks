// terminal_register — §6 Identity; A-87
// Any actor. Header per A-103.
// M0 skeleton (A-99): signature and a stub that throws not_implemented. The
// schemas' bodies and the fake's behaviour are the milestone's contract PR.
import { z } from "zod";
import { header, stub } from "../wrapper";

export const TerminalRegisterInput = header.extend({
  // The function's own arguments land in the contract pull request that opens its milestone (A-99).
});
export type TerminalRegisterInput = z.infer<typeof TerminalRegisterInput>;

export const TerminalRegisterOutput = z.unknown();
export type TerminalRegisterOutput = z.infer<typeof TerminalRegisterOutput>;

export const terminal_register = stub("terminal_register", TerminalRegisterInput, TerminalRegisterOutput);
