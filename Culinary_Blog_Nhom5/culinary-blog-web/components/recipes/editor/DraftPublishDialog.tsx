"use client";

import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { recipeEditorApi } from "@/lib/api/recipeEditorApi";
import { errorPresentation } from "@/lib/errorPresentation";
import { useRecipeMutations } from "@/hooks/mutations/useRecipeMutations";

export function DraftPublishDialog({
  id,
  open,
  onClose,
  onPublished,
}: {
  id: string;
  open: boolean;
  onClose: () => void;
  onPublished: () => void;
}) {
  const [preview, setPreview] = useState(false);
  const locked = useRef(false);
  const { publish } = useRecipeMutations();
  const draft = useQuery({
    queryKey: ["draft-publish-preview", id],
    queryFn: () => recipeEditorApi.getById(id),
    enabled: open && preview,
    staleTime: 0,
    retry: false,
  });
  const recipe = draft.data;
  const images = recipe?.images ?? [];
  const cover = images.find((image) => image.isPrimary) ?? images[0];
  const ingredients = recipe?.ingredients ?? [];
  const steps = recipe?.steps ?? [];
  const nutrition = recipe?.nutrition;
  const error = publish.error ? errorPresentation(publish.error) : null;
  const close = () => {
    if (locked.current) return;
    setPreview(false);
    publish.reset();
    onClose();
  };

  async function confirmPublish() {
    if (
      locked.current ||
      !recipe ||
      draft.isFetching ||
      draft.isError ||
      !ingredients.length ||
      !steps.length
    )
      return;
    locked.current = true;
    try {
      await publish.mutateAsync(id);
      onPublished();
    } catch {
      // The mutation retains the failure so the user can review or retry.
    } finally {
      locked.current = false;
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
      }}
    >
      <DialogContent
        className={preview ? "sm:max-w-2xl" : undefined}
        onCloseAutoFocus={(event) => {
          const target = document.getElementById("draft-result");
          if (target) {
            event.preventDefault();
            target.focus();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>
            {preview ? "Xem trước công thức" : "Đã lưu công thức"}
          </DialogTitle>
          <DialogDescription>
            {preview
              ? "Kiểm tra nội dung đã lưu trước khi công khai."
              : "Bạn muốn giữ bản nháp hay xem trước để xuất bản?"}
          </DialogDescription>
        </DialogHeader>
        {preview && draft.isFetching && (
          <p role="status">Đang tải bản xem trước…</p>
        )}
        {preview && draft.isError && (
          <div role="alert" className="space-y-2">
            <p>Không thể tải bản xem trước.</p>
            <Button
              type="button"
              variant="outline"
              onClick={() => void draft.refetch()}
            >
              Thử lại
            </Button>
          </div>
        )}
        {preview && recipe && (
          <article className="min-w-0 space-y-4 break-words">
            {cover && (
              <Image
                src={cover.url}
                alt={cover.alt || "Ảnh bìa công thức"}
                width={640}
                height={360}
                unoptimized
                className="aspect-video w-full rounded-lg object-cover"
              />
            )}
            <h3 className="text-xl font-semibold">{recipe.title}</h3>
            <p className="whitespace-pre-wrap">{recipe.description}</p>
            {recipe.instructions?.trim() && (
              <div>
                <h4 className="font-semibold">Hướng dẫn</h4>
                <p className="whitespace-pre-wrap">{recipe.instructions}</p>
              </div>
            )}
            <div>
              <h4 className="font-semibold">Nguyên liệu</h4>
              <ul className="list-disc ps-5">
                {ingredients.map((item) => (
                  <li key={item.id}>
                    {item.name} {item.quantity ?? ""} {item.unit ?? ""}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h4 className="font-semibold">Các bước thực hiện</h4>
              <ol className="list-decimal space-y-3 ps-5">
                {steps.map((step) => (
                  <li key={step.id}>
                    <p className="whitespace-pre-wrap">
                      {step.description ?? step.text}
                    </p>
                    {step.imageUrl && (
                      <Image
                        src={step.imageUrl}
                        alt={step.title || "Ảnh minh họa bước nấu"}
                        width={480}
                        height={270}
                        unoptimized
                        className="max-h-48 w-auto rounded-lg object-contain"
                      />
                    )}
                  </li>
                ))}
              </ol>
            </div>
            {nutrition && (
              <div>
                <h4 className="font-semibold">Dinh dưỡng</h4>
                <dl className="grid gap-2 sm:grid-cols-2">
                  {(
                    [
                      ["Calories", nutrition.calories, "kcal"],
                      ["Protein", nutrition.protein, "g"],
                      [
                        "Carbohydrates",
                        nutrition.carbohydrates ?? nutrition.carbs,
                        "g",
                      ],
                      ["Chất béo", nutrition.fat, "g"],
                      ["Chất xơ", nutrition.fiber, "g"],
                      ["Natri", nutrition.sodium, "mg"],
                    ] as const
                  )
                    .filter(([, value]) => value != null)
                    .map(([label, value, unit]) => (
                      <div
                        key={label}
                        className="flex items-baseline justify-between gap-3 rounded-md bg-muted px-3 py-2"
                      >
                        <dt>{label}</dt>
                        <dd className="font-medium">
                          {value} {unit}
                        </dd>
                      </div>
                    ))}
                </dl>
              </div>
            )}
            {(!ingredients.length || !steps.length) && (
              <p role="status">
                Cần ít nhất một nguyên liệu và một bước trước khi xuất bản.
              </p>
            )}
          </article>
        )}
        {error && <p role="alert">{error.description}</p>}
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={publish.isPending}
            onClick={close}
          >
            Giữ bản nháp
          </Button>
          {preview ? (
            <Button
              type="button"
              disabled={
                publish.isPending ||
                draft.isFetching ||
                draft.isError ||
                !recipe ||
                !ingredients.length ||
                !steps.length
              }
              onClick={() => void confirmPublish()}
            >
              {publish.isPending ? "Đang xuất bản…" : "Xác nhận xuất bản"}
            </Button>
          ) : (
            <Button type="button" onClick={() => setPreview(true)}>
              Xuất bản
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
