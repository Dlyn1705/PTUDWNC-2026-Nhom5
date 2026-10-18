"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { getRecipeImageStatus, type RecipeImageDto } from "@/lib/api/fileApi";

const labels = {
  Pending: "Đang chờ tạo thumbnail",
  Processing: "Đang tạo thumbnail…",
  Completed: "Đã tạo ảnh vừa và thumbnail",
  Failed: "Không thể xử lý ảnh. Vui lòng liên hệ quản trị viên.",
};

export default function RecipeImageProcessingPreview({ initial }: { initial: RecipeImageDto }) {
  const [image, setImage] = useState(initial);
  const [notice, setNotice] = useState("");
  const [pollVersion, setPollVersion] = useState(0);
  useEffect(() => {
    if (initial.processingStatus === "Completed" || initial.processingStatus === "Failed") return;
    const controller = new AbortController();
    const started = Date.now();
    let timer: ReturnType<typeof setTimeout>;
    let failures = 0;
    const poll = async () => {
      if (Date.now() - started > 35 * 60_000) {
        setNotice("Ảnh đang chờ lâu. Kiểm tra lại trạng thái hoặc liên hệ quản trị viên.");
        return;
      }
      try {
        const updated = await getRecipeImageStatus(initial.recipeId, initial.id, controller.signal);
        if (controller.signal.aborted) return;
        setImage(updated); failures = 0; setNotice("");
        if (updated.processingStatus === "Completed" || updated.processingStatus === "Failed") return;
      } catch (error) {
        if (controller.signal.aborted) return;
        const status = (error as { response?: { status?: number } }).response?.status;
        failures++;
        setNotice("Không đọc được trạng thái ảnh. Ảnh đã tải lên vẫn được giữ trên máy chủ.");
        if ([401, 403, 404].includes(status ?? 0) || failures >= 3) return;
      }
      timer = setTimeout(poll, 3000);
    };
    timer = setTimeout(poll, 1000);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [initial.id, initial.recipeId, initial.processingStatus, pollVersion]);

  return (
    <div className="space-y-2">
      <Image src={image.thumbnailUrl ?? image.originalUrl} alt={image.altText ?? "Ảnh công thức"}
        width={96} height={96} unoptimized className="h-24 w-24 rounded-lg object-cover" />
      <p role="status" className="text-xs text-muted-foreground">{labels[image.processingStatus]}</p>
      {notice && <p role="alert" className="text-xs text-amber-800">{notice}</p>}
      {notice && <button type="button" className="text-xs underline" onClick={() => { setNotice(""); setPollVersion(value => value + 1); }}>Kiểm tra lại trạng thái</button>}
      {image.processingStatus === "Completed" && (
        <div className="flex flex-wrap gap-3 text-xs underline">
          <a href={image.originalUrl} target="_blank" rel="noreferrer">Ảnh gốc</a>
          {image.mediumUrl && <a href={image.mediumUrl} target="_blank" rel="noreferrer">Ảnh vừa 800×600</a>}
          {image.thumbnailUrl && <a href={image.thumbnailUrl} target="_blank" rel="noreferrer">Thumbnail 300×300</a>}
        </div>
      )}
    </div>
  );
}
