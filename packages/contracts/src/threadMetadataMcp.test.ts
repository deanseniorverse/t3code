import { assert, describe, it } from "@effect/vitest";
import * as Schema from "effect/Schema";

import { ThreadMetadataMcpUpdateInput } from "./threadMetadataMcp.ts";

const decodeUpdate = Schema.decodeUnknownSync(ThreadMetadataMcpUpdateInput);

describe("ThreadMetadataMcpUpdateInput", () => {
  it("rejects malformed client request ids without normalizing valid keys", () => {
    const validKey = "metadata-\ud83d\ude80-1";
    assert.equal(
      decodeUpdate({ action: "regenerate_title", clientRequestId: validKey }).clientRequestId,
      validKey,
    );
    assert.throws(() =>
      decodeUpdate({ action: "regenerate_title", clientRequestId: "metadata-\ud800" }),
    );
    assert.throws(() =>
      decodeUpdate({ action: "regenerate_title", clientRequestId: "metadata-\udc00" }),
    );
  });

  it("pairs folders with set_folders only, as absolute paths", () => {
    assert.deepEqual(
      decodeUpdate({ action: "set_folders", folders: ["/work/clients-x", "/work/services-x"] })
        .folders,
      ["/work/clients-x", "/work/services-x"],
    );
    assert.deepEqual(decodeUpdate({ action: "set_folders", folders: [] }).folders, []);
    assert.throws(() => decodeUpdate({ action: "set_folders" }));
    assert.throws(() => decodeUpdate({ action: "set_folders", folders: ["relative/path"] }));
    assert.throws(() => decodeUpdate({ action: "regenerate_title", folders: ["/work/x"] }));
    assert.throws(() => decodeUpdate({ action: "rename", title: "T", folders: ["/work/x"] }));
  });
});
