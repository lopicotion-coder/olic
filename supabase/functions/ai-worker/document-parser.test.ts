import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import { chunkCurriculumPages } from "./document-parser.ts";

Deno.test("chunks preserve page ranges and Arabic curriculum headings", () => {
  const pages = [
    {
      pageNumber: 7,
      text: "الوحدة الأولى\n" + "هذا نص تعليمي عربي يشرح المفهوم الأساسي بالتفصيل. ".repeat(24),
    },
    {
      pageNumber: 8,
      text: "الدرس الثاني\n" + "هذا نص إضافي مرتبط بالدرس ويحتوي على شرح وتطبيقات. ".repeat(24),
    },
  ];
  const chunks = chunkCurriculumPages(pages, 900);
  assertEquals(chunks.length > 1, true);
  assertEquals(chunks[0].pageStart, 7);
  assertEquals(chunks[chunks.length - 1].pageEnd, 8);
  assertEquals(chunks[0].tokenCount > 0, true);
});

Deno.test("rejects unsafe chunk sizes", () => {
  assertThrows(() => chunkCurriculumPages([], 200), Error);
  assertThrows(() => chunkCurriculumPages([], 20_000), Error);
});
