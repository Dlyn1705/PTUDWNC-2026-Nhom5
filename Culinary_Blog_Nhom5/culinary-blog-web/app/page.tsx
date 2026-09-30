import Link from "next/link";

export default function Home() {
  return (
    <main className="home-shell">
      <nav className="site-header"><Link className="brand" href="/">Bếp Nhà</Link><Link className="header-link" href="/search">Khám phá công thức</Link></nav>
      <section className="home-hero">
        <p className="eyebrow">MÓN NGON BẮT ĐẦU TỪ CẢM HỨNG</p>
        <h1>Mỗi bữa ăn<br /><em>là một câu chuyện.</em></h1>
        <p>Tìm cảm hứng cho căn bếp của bạn với những công thức gần gũi, dễ làm và đầy hương vị.</p>
        <Link className="home-cta" href="/search">Tìm công thức <span>→</span></Link>
      </section>
      <section className="home-note"><span>01 / KHÁM PHÁ</span><p>Từ món quen mỗi ngày đến những hương vị mới đang chờ bạn khám phá.</p></section>
      <footer className="site-footer">Bếp Nhà <span>Chia sẻ cảm hứng, nấu nên yêu thương.</span></footer>
    </main>
  );
}
