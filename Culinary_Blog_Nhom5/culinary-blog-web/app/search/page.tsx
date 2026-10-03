import Link from "next/link";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

type Recipe = {
  id: string;
  title: string;
  slug: string;
  description: string;
  primaryImageUrl: string | null;
  category: { name: string };
  author: { displayName: string };
  difficulty: string;
  prepTime: number;
  cookTime: number;
  relevanceScore: number;
};

type SearchPayload = {
  success: boolean;
  message?: string;
  data?: { items: Recipe[]; totalCount: number; page: number; pageSize: number; totalPages: number };
};
type Category = { id: string; name: string; recipeCount: number };

function valueOf(value: string | string[] | undefined, fallback = "") {
  return Array.isArray(value) ? value[0] ?? fallback : value ?? fallback;
}

export default async function SearchPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const q = valueOf(params.q).trim();
  const page = Math.max(1, Number.parseInt(valueOf(params.page, "1"), 10) || 1);
  const pageSize = 12;
  const categoryId = valueOf(params.categoryId);
  const difficulty = valueOf(params.difficulty);
  const sort = valueOf(params.sort, "relevance");
  const apiBase = process.env.CULINARY_API_BASE_URL ?? "http://localhost:5156/api/v1";
  let result: SearchPayload | null = null;
  let error: string | null = null;

  if (q.length >= 2) {
    const query = new URLSearchParams({ q, page: String(page), pageSize: String(pageSize), sort });
    if (categoryId) query.set("categoryId", categoryId);
    if (difficulty) query.set("difficulty", difficulty);
    try {
      const response = await fetch(`${apiBase}/recipes/search?${query}`, { cache: "no-store" });
      if (!response.ok) {
        error = response.status === 422 ? "Từ khóa hoặc bộ lọc chưa hợp lệ." : "Không thể tải kết quả tìm kiếm.";
      } else {
        result = (await response.json()) as SearchPayload;
        if (!result.success) error = result.message ?? "Tìm kiếm không thành công.";
      }
    } catch {
      error = "Chưa kết nối được máy chủ công thức. Hãy thử lại sau.";
    }
  }

  let categories: Category[] = [];
  try {
    const response = await fetch(`${apiBase}/categories/`, { next: { revalidate: 300 } });
    if (response.ok) categories = (await response.json()) as Category[];
  } catch {
    // Keep search usable while the optional category list is unavailable.
  }

  const data = result?.data;
  const previousUrl = new URLSearchParams({ q, page: String(Math.max(1, page - 1)), sort });
  const nextUrl = new URLSearchParams({ q, page: String(page + 1), sort });
  if (categoryId) { previousUrl.set("categoryId", categoryId); nextUrl.set("categoryId", categoryId); }
  if (difficulty) { previousUrl.set("difficulty", difficulty); nextUrl.set("difficulty", difficulty); }

  return (
    <main className="search-shell">
      <header className="site-header">
        <Link className="brand" href="/">Bếp Nhà</Link>
        <Link className="header-link" href="/search">Khám phá công thức</Link>
      </header>

      <section className="search-hero">
        <p className="eyebrow">CÔNG THỨC NGON MỖI NGÀY</p>
        <h1>Tìm món bạn muốn nấu</h1>
        <p className="hero-copy">Tìm nhanh công thức theo tên món hoặc mô tả, có dấu hay không dấu đều được.</p>
        <form action="/search" className="search-form">
          <label className="sr-only" htmlFor="recipe-query">Từ khóa</label>
          <input id="recipe-query" name="q" defaultValue={q} minLength={2} maxLength={100} placeholder="Ví dụ: phở bò, banh xeo..." required />
          <button type="submit">Tìm công thức</button>
        </form>
        <form action="/search" className="filter-form">
          <input type="hidden" name="q" value={q} />
          <label>Danh mục
            <select name="categoryId" defaultValue={categoryId}>
              <option value="">Tất cả</option>{categories.map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}
            </select>
          </label>
          <label>Độ khó
            <select name="difficulty" defaultValue={difficulty}>
              <option value="">Tất cả</option><option value="1">Dễ</option><option value="2">Trung bình</option><option value="3">Khó</option><option value="4">Bếp trưởng</option>
            </select>
          </label>
          <label>Sắp xếp
            <select name="sort" defaultValue={sort}>
              <option value="relevance">Liên quan nhất</option><option value="-createdAt">Mới nhất</option><option value="createdAt">Cũ nhất</option><option value="cookTime">Nấu nhanh nhất</option><option value="-cookTime">Nấu lâu nhất</option><option value="title">Tên món A–Z</option>
            </select>
          </label>
          <button className="filter-button" type="submit">Áp dụng</button>
        </form>
      </section>

      <section className="results-section" aria-live="polite">
        {q.length < 2 ? (
          <div className="empty-state"><span className="empty-icon">⌕</span><h2>Bạn đang tìm món gì?</h2><p>Nhập ít nhất 2 ký tự để khám phá các công thức phù hợp.</p></div>
        ) : error ? (
          <div className="notice" role="alert">{error}</div>
        ) : data ? (
          <>
            <div className="results-heading"><div><p className="eyebrow">KẾT QUẢ TÌM KIẾM</p><h2>{data.totalCount} công thức cho “{q}”</h2></div><span>Trang {data.page} / {data.totalPages || 1}</span></div>
            {data.items.length ? <div className="recipe-grid">{data.items.map((recipe) => (
              <article className="recipe-card" key={recipe.id}>
                <div className="recipe-photo" role="img" aria-label={recipe.title} style={recipe.primaryImageUrl ? { backgroundImage: `linear-gradient(180deg, transparent 45%, rgba(31,27,22,.35)), url("${recipe.primaryImageUrl}")` } : undefined}>
                  {!recipe.primaryImageUrl && <span>🍲</span>}
                  <span className="category-pill">{recipe.category?.name ?? "Món ngon"}</span>
                </div>
                <div className="recipe-info">
                  <div className="recipe-meta"><span>{recipe.difficulty}</span><span>{recipe.prepTime + recipe.cookTime} phút</span></div>
                  <h3>{recipe.title}</h3>
                  <p>{recipe.description}</p>
                  <div className="recipe-footer"><span>Bởi {recipe.author?.displayName ?? "Đầu bếp"}</span><span aria-label={`Điểm phù hợp ${recipe.relevanceScore.toFixed(3)}`}>✦ {recipe.relevanceScore.toFixed(2)}</span></div>
                </div>
              </article>
            ))}</div> : <div className="empty-state compact"><span className="empty-icon">⌕</span><h2>Chưa tìm thấy công thức phù hợp</h2><p>Thử từ khóa khác hoặc bỏ bớt bộ lọc nhé.</p></div>}
            {data.totalPages > 1 && <nav className="pagination" aria-label="Phân trang kết quả">
              {page > 1 ? <Link href={`/search?${previousUrl}`}>← Trang trước</Link> : <span />}
              <span>{data.page} / {data.totalPages}</span>
              {page < data.totalPages ? <Link href={`/search?${nextUrl}`}>Trang sau →</Link> : <span />}
            </nav>}
          </>
        ) : null}
      </section>
      <footer className="site-footer">Bếp Nhà <span>Chia sẻ cảm hứng, nấu nên yêu thương.</span></footer>
    </main>
  );
}
