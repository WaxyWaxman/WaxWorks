// record_upsert_from_provider — §6 Catalog
// Any actor. Header per A-103.
// M0 skeleton (A-99): signature and a stub that throws not_implemented. The
// schemas' bodies and the fake's behaviour are the milestone's contract PR.
import { z } from "zod";
import { header, stub } from "../wrapper";

export const RecordUpsertFromProviderInput = header.extend({
  // The function's own arguments land in the contract pull request that opens its milestone (A-99).
});
export type RecordUpsertFromProviderInput = z.infer<typeof RecordUpsertFromProviderInput>;

export const RecordUpsertFromProviderOutput = z.unknown();
export type RecordUpsertFromProviderOutput = z.infer<typeof RecordUpsertFromProviderOutput>;

export const record_upsert_from_provider = stub("record_upsert_from_provider", RecordUpsertFromProviderInput, RecordUpsertFromProviderOutput);
