"use client";

interface DeleteRecipeModalProps {
  open: boolean;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function DeleteRecipeModal({
  open,
  busy = false,
  onCancel,
  onConfirm,
}: DeleteRecipeModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="text-xl font-semibold text-gray-900">Xóa công thức?</h2>
        <p className="mt-2 text-sm text-gray-600">
          Công thức sẽ được ẩn ngay và chuyển sang xóa vật lý sau 30 ngày.
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onCancel} disabled={busy} className="rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700">
            Hủy
          </button>
          <button type="button" onClick={onConfirm} disabled={busy} className="rounded-xl bg-red-600 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60">
            {busy ? "Đang xóa..." : "Xóa công thức"}
          </button>
        </div>
      </div>
    </div>
  );
}
