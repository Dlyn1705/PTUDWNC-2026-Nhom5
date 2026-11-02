import type { SearchRecipesParams } from "@/types/api.types";

type Params = Record<string, string | string[] | undefined>;
const first = (value: Params[string]) => (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
const fields: Record<string, NonNullable<SearchRecipesParams["sortBy"]>> = {
  relevance: "relevance", createdat: "createdAt", title: "title", cooktime: "cookTime",
};
const field = (name: string) => Object.hasOwn(fields, name) ? fields[name] : undefined;

/** Reject malformed shared links instead of silently searching a different set of recipes. */
export function parseSearchParams(params: Params) {
  const errors: string[] = [];
  const labels: Record<string, string> = { page: "Trang", pageSize: "Số công thức mỗi trang",
    minCookTime: "Thời gian tối thiểu", maxCookTime: "Thời gian tối đa", servings: "Khẩu phần",
    minServings: "Khẩu phần tối thiểu", maxServings: "Khẩu phần tối đa" };
  const integer = (key: string, minimum: number, maximum: number, fallback?: number) => {
    const value = first(params[key]);
    if (!value) return fallback;
    const number = Number(value);
    if (!/^\d+$/.test(value) || !Number.isSafeInteger(number) || number < minimum || number > maximum) {
      errors.push(`${labels[key]}: nhập số nguyên từ ${minimum} đến ${maximum}.`);
      return fallback;
    }
    return number;
  };
  const q = first(params.q);
  if (q.length > 100) errors.push("Từ khóa tìm kiếm tối đa 100 ký tự.");
  const page = integer("page", 1, 2147483647, 1)!;
  const pageSize = integer("pageSize", 1, 50, 12)!;
  if ((page - 1) * pageSize > 2147483647) errors.push("Trang vượt quá phạm vi phân trang hỗ trợ.");
  const categoryId = first(params.categoryId);
  if (categoryId && (!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(categoryId) || /^0{8}(-0{4}){3}-0{12}$/.test(categoryId))) {
    errors.push("Danh mục không hợp lệ.");
  }
  const difficulty = first(params.difficulty);
  if (difficulty && !["1", "2", "3", "4"].includes(difficulty)) errors.push("Độ khó không được hỗ trợ.");
  const minCookTime = integer("minCookTime", 0, 2147483647);
  const maxCookTime = integer("maxCookTime", 0, 2147483647);
  const servings = integer("servings", 1, 2147483647);
  const minServings = integer("minServings", 1, 2147483647) ?? servings;
  const maxServings = integer("maxServings", 1, 2147483647) ?? servings;
  if (minCookTime !== undefined && maxCookTime !== undefined && minCookTime > maxCookTime) errors.push("Thời gian tối đa phải lớn hơn hoặc bằng tối thiểu.");
  if (minServings !== undefined && maxServings !== undefined && minServings > maxServings) errors.push("Khẩu phần tối đa phải lớn hơn hoặc bằng tối thiểu.");
  if (servings !== undefined && (minServings !== servings || maxServings !== servings)) errors.push("Khẩu phần chính xác không được mâu thuẫn với khoảng khẩu phần.");

  const rawSortBy = first(params.sortBy).toLowerCase();
  const rawOrder = first(params.sortOrder).toLowerCase();
  const canonical = Boolean(rawSortBy || rawOrder);
  const legacy = first(params.sort).toLowerCase();
  const legacyField = legacy.startsWith("-") ? legacy.slice(1) : legacy;
  if (rawSortBy && !Object.hasOwn(fields, rawSortBy)) errors.push("Kiểu sắp xếp không được hỗ trợ.");
  if (rawOrder && !["asc", "desc"].includes(rawOrder)) errors.push("Thứ tự sắp xếp phải là asc hoặc desc.");
  if (!canonical && legacy && (!Object.hasOwn(fields, legacyField) || legacy === "-relevance")) errors.push("Kiểu sắp xếp cũ không được hỗ trợ.");
  const sortBy = (canonical ? field(rawSortBy) : field(legacyField)) ?? "relevance";
  const sortOrder: "asc" | "desc" = sortBy === "relevance" ? "desc"
    : canonical ? (rawOrder === "asc" ? "asc" : "desc") : legacy && !legacy.startsWith("-") ? "asc" : "desc";
  return { q, page, pageSize, categoryId, difficulty, minCookTime, maxCookTime, minServings, maxServings, sortBy, sortOrder, errors };
}
