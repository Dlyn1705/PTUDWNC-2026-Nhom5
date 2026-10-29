import { UnauthorizedState } from "@/components/common/UnauthorizedState";
import { SiteShell } from "@/components/layout/SiteShell";

export default function ForbiddenPage() {
  return (
    <SiteShell>
      <div className="page-container flex min-h-[70vh] items-center py-12">
        <UnauthorizedState
          mode="forbidden"
          title="Truy cập bị từ chối"
          description="Tài khoản của bạn không có quyền mở khu vực này. Nếu cho rằng đây là nhầm lẫn, hãy liên hệ quản trị viên."
          focusOnMount
        />
      </div>
    </SiteShell>
  );
}
