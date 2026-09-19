import { expect, test, type Page } from "@playwright/test";
import { Client } from "pg";
import { makeLiveLot, reset } from "./fixtures";

interface CatalogueLot {
  id: string;
  title: string;
  maker?: string;
  code?: string;
  year?: string;
  status?: "live" | "upcoming" | "results";
}

/** Reuse valid auction fixtures, then give the catalogue distinct search data. */
async function makeCatalogueLots(lots: CatalogueLot[]): Promise<void> {
  const url =
    process.env.TEST_DATABASE_URL ??
    "postgres://urlug:urlug@localhost:5432/urlug_test";
  const name = new URL(url).pathname.replace(/^\//, "");
  if (!name.endsWith("_test")) {
    throw new Error(`Refusing catalogue fixtures against "${name}".`);
  }

  for (const lot of lots) await makeLiveLot(lot.id);

  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const now = Date.now();
    for (const [index, lot] of lots.entries()) {
      const status = lot.status ?? "live";
      const opensAt = new Date(
        now + (status === "upcoming" ? 86_400_000 : -30_000) + index,
      );
      await client.query(
        `UPDATE lots
            SET title = $2, maker = $3, code = $4, year = $5, starts_at = $6
          WHERE id = $1`,
        [
          lot.id,
          lot.title,
          lot.maker ?? "Unknown workshop",
          lot.code ?? `CAT-${lot.id}`,
          lot.year ?? "1901",
          opensAt,
        ],
      );
      await client.query(
        "UPDATE auctions SET opens_at = $2, outcome = $3 WHERE lot_id = $1",
        [
          lot.id,
          opensAt,
          status === "upcoming"
            ? "scheduled"
            : status === "results"
              ? "unsold"
              : "running",
        ],
      );
    }
  } finally {
    await client.end();
  }
}

async function searchFor(page: Page, query: string): Promise<void> {
  await page.getByRole("searchbox", { name: "Лот хайх" }).fill(query);
  await page.getByRole("button", { name: "Лот хайх", exact: true }).click();
  await expect(page).toHaveURL((url) => url.searchParams.get("q") === query);
}

test.beforeEach(async () => {
  await reset();
});

for (const { field, query } of [
  { field: "title", query: "өргөөний" },
  { field: "maker", query: "sARUUL sTUDIO" },
  { field: "code", query: "cat-az42" },
  { field: "year", query: "xviii" },
]) {
  test(`catalogue search matches ${field} without case sensitivity`, async ({
    page,
  }) => {
    await makeCatalogueLots([
      {
        id: "SEARCH",
        title: "ӨРГӨӨНИЙ Хүрэл Цом",
        maker: "Saruul Studio",
        code: "CAT-AZ42",
        year: "XVIII зуун",
      },
      { id: "OTHER", title: "A different sculpture" },
    ]);
    await page.goto("/lots");
    await searchFor(page, query);

    // The hero can show an unrelated featured lot; assert the filtered grid.
    const catalogue = page.locator("#catalogue");
    await expect(catalogue.getByRole("article")).toHaveCount(1);
    await expect(catalogue.getByRole("heading", { level: 3 })).toHaveText(
      "ӨРГӨӨНИЙ Хүрэл Цом",
    );
    await expect(page.getByRole("searchbox")).toHaveValue(query);
  });
}

test("status filters retain the search query and show only matching lots", async ({
  page,
}) => {
  await makeCatalogueLots([
    { id: "LIVE", title: "Bronze vessel" },
    { id: "SOON", title: "Bronze figure", status: "upcoming" },
    { id: "ENDED", title: "Bronze mirror", status: "results" },
    { id: "OTHER", title: "Silver ring" },
  ]);
  await page.goto("/lots");
  await searchFor(page, "bRoNzE");

  const catalogue = page.locator("#catalogue");
  const filters = catalogue.getByRole("navigation", { name: "Каталог" });
  await expect(catalogue.getByRole("article")).toHaveCount(3);
  for (const { filter, label, title } of [
    { filter: "live", label: /^Шууд/, title: "Bronze vessel" },
    { filter: "upcoming", label: /^Удахгүй/, title: "Bronze figure" },
    { filter: "results", label: /^Дууссан/, title: "Bronze mirror" },
  ]) {
    await filters.getByRole("link", { name: label }).click();
    await expect(page).toHaveURL(
      (url) =>
        url.searchParams.get("filter") === filter &&
        url.searchParams.get("q") === "bRoNzE" &&
        !url.searchParams.has("page"),
    );
    await expect(catalogue.getByRole("article")).toHaveCount(1);
    await expect(catalogue.getByRole("heading", { level: 3 })).toHaveText(
      title,
    );
    await expect(filters.getByRole("link", { name: label })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(page.getByRole("searchbox")).toHaveValue("bRoNzE");
  }
});

test("pagination retains the query while a new search or filter resets the page", async ({
  page,
}) => {
  await makeCatalogueLots([
    ...Array.from({ length: 11 }, (_, index) => ({
      id: `PAGE-${index + 1}`,
      title: `Archive ceramic ${index + 1}`,
    })),
    { id: "OTHER", title: "Silver ring" },
  ]);
  await page.goto("/lots?filter=all");
  await searchFor(page, "Archive");

  const catalogue = page.locator("#catalogue");
  const pagination = catalogue.getByRole("navigation", { name: "Лотууд" });
  await expect(catalogue.getByRole("article")).toHaveCount(9);
  await pagination.getByRole("link", { name: "Дараах", exact: true }).click();
  await expect(page).toHaveURL(
    (url) =>
      url.searchParams.get("q") === "Archive" &&
      url.searchParams.get("filter") === "all" &&
      url.searchParams.get("page") === "2",
  );
  await expect(catalogue.getByRole("heading", { level: 3 })).toHaveText([
    "Archive ceramic 10",
    "Archive ceramic 11",
  ]);
  await expect(page.getByRole("searchbox")).toHaveValue("Archive");

  // Both searches have two pages: clamping a stale page cannot hide a failure.
  await searchFor(page, "ceramic");
  await expect(page).toHaveURL(
    (url) =>
      url.searchParams.get("q") === "ceramic" && !url.searchParams.has("page"),
  );
  await expect(catalogue.getByRole("article")).toHaveCount(9);
  await expect(
    pagination.getByRole("link", { name: "1-р хуудас", exact: true }),
  ).toHaveAttribute("aria-current", "page");

  await pagination.getByRole("link", { name: "Дараах", exact: true }).click();
  await expect(page).toHaveURL((url) => url.searchParams.get("page") === "2");
  await catalogue
    .getByRole("navigation", { name: "Каталог" })
    .getByRole("link", { name: /^Шууд/ })
    .click();
  await expect(page).toHaveURL(
    (url) =>
      url.searchParams.get("q") === "ceramic" &&
      url.searchParams.get("filter") === "live" &&
      !url.searchParams.has("page"),
  );
  await expect(catalogue.getByRole("article")).toHaveCount(9);
  await expect(
    pagination.getByRole("link", { name: "1-р хуудас", exact: true }),
  ).toHaveAttribute("aria-current", "page");
});

test("an empty search fits a narrow screen and clearing it keeps the status filter", async ({
  page,
}) => {
  await makeCatalogueLots([
    { id: "LIVE", title: "Bronze vessel" },
    { id: "SOON", title: "Silver figure", status: "upcoming" },
  ]);
  await page.setViewportSize({ width: 280, height: 800 });
  await page.goto("/lots?filter=upcoming");
  await searchFor(page, "Unmatched".repeat(11));

  const catalogue = page.locator("#catalogue");
  await expect(catalogue.getByRole("article")).toHaveCount(0);
  await expect(
    catalogue.getByText("Таны хайлтад тохирох лот олдсонгүй.", { exact: true }),
  ).toBeVisible();
  await expect(
    catalogue.getByRole("navigation", { name: "Лотууд" }),
  ).toHaveCount(0);
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(
    overflow,
    "Search controls and query text must fit a 280px screen",
  ).toBeLessThanOrEqual(1);

  await catalogue
    .getByRole("link", { name: "Хайлтыг арилгах", exact: true })
    .last()
    .click();
  await expect(page).toHaveURL(
    (url) =>
      url.searchParams.get("filter") === "upcoming" &&
      !url.searchParams.has("q") &&
      !url.searchParams.has("page"),
  );
  await expect(page.getByRole("searchbox")).toHaveValue("");
  await expect(catalogue.getByRole("heading", { level: 3 })).toHaveText(
    "Silver figure",
  );
  await expect(catalogue.getByRole("article")).toHaveCount(1);
});

test("the featured lot and all status filters fit at 280px and 320px", async ({
  page,
}) => {
  await makeCatalogueLots([
    { id: "LIVE", title: "Bronze vessel" },
    { id: "SOON", title: "Silver figure", status: "upcoming" },
  ]);

  for (const width of [280, 320]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/lots");
    await expect(page.locator(".featured-lot")).toBeVisible();
    await expect(page.locator(".catalogue-filter")).toHaveCount(4);

    // A clipped parent can hide overflow without widening the document.
    // Check the visible controls and featured card themselves as well.
    const bounds = await page
      .locator(".featured-lot, .catalogue-filter")
      .evaluateAll((elements) =>
        elements.map((element) => {
          const rect = element.getBoundingClientRect();
          return {
            label: element.className,
            left: rect.left,
            right: rect.right,
          };
        }),
      );
    for (const box of bounds) {
      expect(
        box.left,
        `${box.label} left edge at ${width}px`,
      ).toBeGreaterThanOrEqual(-1);
      expect(
        box.right,
        `${box.label} right edge at ${width}px`,
      ).toBeLessThanOrEqual(width + 1);
    }

    const filterOverflow = await page
      .locator(".catalogue-filters")
      .evaluate((element) => element.scrollWidth - element.clientWidth);
    expect(
      filterOverflow,
      `Status filters must not scroll sideways at ${width}px`,
    ).toBeLessThanOrEqual(1);
  }
});
