"use client";

import { useState } from "react";
import Image from "next/image";
import { Eye } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { formatIngredientQuantity } from "@/lib/ingredient-display";
import type { IngredientDraft } from "@/lib/ingredient-form";
import type { StepDraft } from "@/lib/step-form";
import type { RecipeEditorValues } from "@/lib/validations/recipeEditor";
import type { RecipeImageDto } from "@/types/file.types";

export type RecipePreviewData = {
  ingredients: IngredientDraft[];
  steps: StepDraft[];
  images: RecipeImageDto[];
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  values: RecipeEditorValues;
  categoryName?: string;
  data: RecipePreviewData;
};

type Audience = "guest" | "author";

const isPreviewUrl = (value: string) => {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password;
  } catch {
    return false;
  }
};

const difficultyLabel: Record<RecipeEditorValues["difficulty"], string> = {
  "1": "Dễ",
  "2": "Trung bình",
  "3": "Khó",
  "4": "Chuyên gia",
};

export function RecipePreviewDialog({ open, onOpenChange, values, categoryName, data }: Props) {
  const [audience, setAudience] = useState<Audience>("guest");
  const primaryImage = data.images.find(image => image.isPrimary) ?? data.images[0];
  const heroUrl = primaryImage?.mediumUrl ?? primaryImage?.originalUrl;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <div className="space-y-2 pr-7">
          <DialogTitle>Xem trước công thức</DialogTitle>
          <DialogDescription>Chỉ xem trước dữ liệu đang nhập; thao tác này không lưu hay công khai công thức.</DialogDescription>
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Chọn chế độ xem trước">
          <button type="button" aria-pressed={audience === "guest"} onClick={() => setAudience("guest")}
            className="rounded-full border px-4 py-2 text-sm aria-pressed:bg-primary aria-pressed:text-primary-foreground">
            Chế độ khách
          </button>
          <button type="button" aria-pressed={audience === "author"} onClick={() => setAudience("author")}
            className="rounded-full border px-4 py-2 text-sm aria-pressed:bg-primary aria-pressed:text-primary-foreground">
            Chế độ tác giả
          </button>
        </div>

        <article className="max-h-[65dvh] space-y-6 overflow-y-auto rounded-xl border bg-background p-4 sm:p-6">
          {audience === "author" && <p className="rounded-lg bg-accent px-4 py-3 text-sm text-accent-foreground">
            Chế độ tác giả — bản xem trước riêng tư, chưa thay đổi trạng thái công thức.
          </p>}
          {heroUrl && isPreviewUrl(heroUrl) && <Image src={heroUrl} alt={primaryImage?.altText || values.title || "Ảnh công thức"}
            width={1200} height={675} unoptimized className="max-h-96 w-full rounded-xl object-cover" />}
          <header className="space-y-3">
            <p className="text-sm font-medium text-primary">{categoryName || "Chưa chọn danh mục"}</p>
            <h2 className="font-display text-3xl font-bold">{values.title.trim() || "Tên món ăn"}</h2>
            <p className="whitespace-pre-wrap text-muted-foreground">{values.description.trim() || "Mô tả món ăn sẽ hiển thị ở đây."}</p>
            <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted-foreground">
              <span>{difficultyLabel[values.difficulty]}</span>
              <span>Chuẩn bị: {values.prepTime || "—"} phút</span>
              <span>Nấu: {values.cookTime || "—"} phút</span>
              <span>Khẩu phần: {values.servings || "—"}</span>
            </div>
          </header>

          {data.images.length > 1 && <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {data.images.filter(image => image.id !== primaryImage?.id).map(image => {
              const src = image.thumbnailUrl ?? image.mediumUrl ?? image.originalUrl;
              return isPreviewUrl(src) ? <Image key={image.id} src={src} alt={image.altText || "Ảnh công thức"}
                width={360} height={240} unoptimized className="h-36 w-full rounded-lg object-cover" /> : null;
            })}
          </div>}

          {data.ingredients.length > 0 && <section className="space-y-2">
            <h3 className="text-xl font-semibold">Nguyên liệu</h3>
            <ul className="list-disc space-y-1 pl-5">
              {data.ingredients.filter(item => item.name.trim()).map((item, index) => {
                const quantity = item.quantity.trim()
                  ? `${formatIngredientQuantity(Number(item.quantity.replace(",", ".")))} ${item.unit.trim()}`.trim()
                  : item.unit.trim();
                return <li key={item.ingredientId ?? index}>{[quantity, item.name.trim(), item.notes.trim()].filter(Boolean).join(" — ")}</li>;
              })}
            </ul>
          </section>}

          {data.steps.length > 0 && <section className="space-y-3">
            <h3 className="text-xl font-semibold">Cách làm</h3>
            <ol className="space-y-4">
              {data.steps.map((step, index) => <li key={step.stepId ?? index} className="space-y-2 rounded-lg border p-4">
                <h4 className="font-semibold">{step.title.trim() || `Bước ${index + 1}`}</h4>
                <p className="whitespace-pre-wrap text-sm text-muted-foreground">{step.description.trim()}</p>
                {step.timerMinutes && <p className="text-sm">Thời gian: {step.timerMinutes} phút</p>}
                {isPreviewUrl(step.imageUrl) && <Image src={step.imageUrl} alt={`Ảnh bước ${index + 1}`}
                  width={720} height={405} unoptimized className="max-h-56 w-auto rounded-lg object-contain" />}
              </li>)}
            </ol>
          </section>}

          {values.instructions.trim() && <section className="space-y-2">
            <h3 className="text-xl font-semibold">Hướng dẫn</h3>
            <p className="whitespace-pre-wrap">{values.instructions.trim()}</p>
          </section>}

          {(["calories", "protein", "carbohydrates", "fat", "fiber", "sodium"] as const).some(field => values[field].trim()) &&
            <section className="space-y-2">
              <h3 className="text-xl font-semibold">Dinh dưỡng</h3>
              <div className="flex flex-wrap gap-3 text-sm">
                {(["calories", "protein", "carbohydrates", "fat", "fiber", "sodium"] as const)
                  .filter(field => values[field].trim())
                  .map(field => <span key={field} className="rounded-full bg-muted px-3 py-1">{field}: {values[field]}</span>)}
              </div>
            </section>}
        </article>
        <p className="flex items-center gap-2 text-xs text-muted-foreground"><Eye aria-hidden="true" className="size-4" />
          Ảnh chỉ xuất hiện sau khi đã tải lên. Đóng cửa sổ này để tiếp tục chỉnh sửa.
        </p>
      </DialogContent>
    </Dialog>
  );
}
