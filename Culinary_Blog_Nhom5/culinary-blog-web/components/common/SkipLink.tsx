"use client";

export function SkipLink() {
  return <a href="#main-content"
    className="skip-link"
    onClick={event => {
      const main = document.getElementById("main-content");
      if (main) { event.preventDefault(); main.focus(); main.scrollIntoView({ block: "start" }); }
    }}>Bỏ qua điều hướng, tới nội dung chính</a>;
}
