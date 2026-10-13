"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { uploadRecipeImage, type RecipeImageDto } from "@/lib/api/fileApi";

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);

type Props = {
  recipeId: string;
  onUploadSuccess?: (image: RecipeImageDto) => void;
};

export default function FileUploadDropzone({ recipeId, onUploadSuccess }: Props) {
  const [selected, setSelected] = useState<{ file: File; previewUrl: string } | null>(null);
  const file = selected?.file ?? null;
  const previewUrl = selected?.previewUrl ?? null;
  const [progress, setProgress] = useState(0);
  const [state, setState] = useState<"idle" | "uploading" | "success" | "error" | "cancelled">("idle");
  const [message, setMessage] = useState("");
  const [altText, setAltText] = useState("");
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!selected) return;
    const url = selected.previewUrl;
    return () => URL.revokeObjectURL(url);
  }, [selected]);

  useEffect(() => () => controllerRef.current?.abort(), []);

  const chooseFile = (candidate?: File) => {
    if (!candidate) return;
    if (!ACCEPTED_TYPES.has(candidate.type)) {
      setSelected(null);
      setMessage("Chỉ chấp nhận ảnh JPEG, PNG, WebP hoặc AVIF.");
      setState("error");
      return;
    }
    if (candidate.size <= 0 || candidate.size > MAX_FILE_SIZE) {
      setSelected(null);
      setMessage("Ảnh phải có dung lượng từ 1 byte đến 5 MiB.");
      setState("error");
      return;
    }
    setSelected({ file: candidate, previewUrl: URL.createObjectURL(candidate) });
    setProgress(0);
    setMessage("");
    setState("idle");
  };

  const upload = async () => {
    if (!file || state === "uploading") return;
    const controller = new AbortController();
    controllerRef.current = controller;
    setState("uploading");
    setMessage("");
    try {
      const image = await uploadRecipeImage(recipeId, file, setProgress, controller.signal, altText);
      setState("success");
      setMessage(`Đã tải ảnh lên. Trạng thái xử lý: ${image.processingStatus}.`);
      onUploadSuccess?.(image);
    } catch (error) {
      if (controller.signal.aborted) {
        setState("cancelled");
        setMessage("Đã dừng thao tác. Nếu máy chủ đã nhận file, ảnh vẫn có thể được lưu.");
      } else {
        setState("error");
        setMessage(error instanceof Error ? error.message : "Tải ảnh thất bại. Vui lòng thử lại.");
      }
    } finally {
      controllerRef.current = null;
    }
  };

  return (
    <section className="space-y-3" aria-label="Tải ảnh công thức">
      <label
        className={`flex min-h-40 w-full cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-5 text-center transition ${dragging ? "border-primary bg-primary/5" : "border-gray-300 bg-gray-50 hover:border-primary"}`}
        aria-describedby="recipe-image-upload-help"
        onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => { event.preventDefault(); setDragging(false); chooseFile(event.dataTransfer.files[0]); }}
      >
        {previewUrl ? (
          <Image src={previewUrl} alt="Xem trước ảnh đã chọn" width={640} height={400} unoptimized className="mb-3 max-h-48 w-auto rounded-lg object-contain" />
        ) : <span className="mb-2 text-3xl" aria-hidden="true">📷</span>}
        <span className="font-medium">{file?.name ?? "Chọn ảnh hoặc kéo thả vào đây"}</span>
        <span id="recipe-image-upload-help" className="mt-1 text-sm text-gray-500">JPEG, PNG, WebP, AVIF · tối đa 5 MiB</span>
        <input
          ref={inputRef}
          className="sr-only"
          type="file"
          tabIndex={0}
          accept="image/jpeg,image/png,image/webp,image/avif,.jpg,.jpeg,.png,.webp,.avif"
          aria-label="Chọn ảnh công thức"
          onChange={(event) => { chooseFile(event.target.files?.[0]); event.currentTarget.value = ""; }}
        />
      </label>

      {state === "uploading" && (
        <div>
          <progress className="w-full" value={progress} max={100} aria-label={`Đang tải ảnh ${progress}%`} />
          <div className="text-right text-sm text-gray-600">{progress}%</div>
          {progress === 100 && <p className="text-sm text-gray-600">Đang tạo ảnh xem trước...</p>}
        </div>
      )}
      {message && <p role={state === "error" ? "alert" : "status"} className={state === "error" ? "text-sm text-red-600" : "text-sm text-gray-600"}>{message}</p>}

      <div className="flex gap-2">
        {state === "uploading" ? (
          <button type="button" className="rounded-lg border px-4 py-2" onClick={() => controllerRef.current?.abort()}>Hủy</button>
        ) : (
          <button type="button" className="rounded-lg bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50" disabled={!file || state === "success"} onClick={upload}>
            {state === "error" || state === "cancelled" ? "Thử lại" : "Tải ảnh lên"}
          </button>
        )}
        {file && state !== "uploading" && (
          <button type="button" className="rounded-lg border px-4 py-2" onClick={() => { setSelected(null); setProgress(0); setState("idle"); setMessage(""); }}>Chọn ảnh khác</button>
        )}
      </div>
      <label className="block text-sm text-gray-700">
        Văn bản thay thế (không bắt buộc)
        <input
          value={altText}
          maxLength={200}
          onChange={(event) => setAltText(event.target.value)}
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
          placeholder="Mô tả ngắn về món ăn trong ảnh"
        />
      </label>
    </section>
  );
}
