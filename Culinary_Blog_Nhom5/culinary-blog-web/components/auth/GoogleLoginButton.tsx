"use client";

import Script from "next/script";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { googleLogin } from "@/lib/api/authApi";

type GoogleCredentialResponse = {
  credential?: string;
};

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize(options: {
            client_id: string;
            callback: (response: GoogleCredentialResponse) => void;
            auto_select?: boolean;
            cancel_on_tap_outside?: boolean;
            use_fedcm_for_prompt?: boolean;
          }): void;
          renderButton(
            parent: HTMLElement,
            options: {
              theme: "outline";
              size: "large";
              shape: "rectangular";
              text: "continue_with";
              width: number;
            },
          ): void;
          prompt(): void;
        };
      };
    };
  }
}

interface GoogleLoginButtonProps {
  callbackUrl?: string;
}

export function GoogleLoginButton({
  callbackUrl = "/",
}: GoogleLoginButtonProps) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

  const handleCredential = useCallback(
    async (response: GoogleCredentialResponse) => {
      if (!response.credential) {
        setError("Google không trả về thông tin đăng nhập hợp lệ.");
        return;
      }

      setIsPending(true);
      setError(null);
      try {
        const result = await googleLogin({ idToken: response.credential });
        if (result?.error) {
          setError("Không thể đăng nhập bằng Google. Vui lòng thử lại.");
          return;
        }

        router.replace(callbackUrl);
        router.refresh();
      } catch {
        setError("Không thể đăng nhập bằng Google. Vui lòng thử lại.");
      } finally {
        setIsPending(false);
      }
    },
    [callbackUrl, router],
  );

  const initializeGoogle = useCallback(() => {
    const container = document.getElementById("google-sign-in-button");
    if (!clientId || !container || !window.google) return;

    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: handleCredential,
      auto_select: false,
      cancel_on_tap_outside: true,
      use_fedcm_for_prompt: true,
    });
    container.replaceChildren();
    window.google.accounts.id.renderButton(container, {
      theme: "outline",
      size: "large",
      shape: "rectangular",
      text: "continue_with",
      width: Math.min(container.clientWidth || 360, 400),
    });
    // Keep the explicit button and enable GIS One Tap when permitted by the
    // browser and the configured Google client.
    window.google.accounts.id.prompt();
  }, [clientId, handleCredential]);

  if (!clientId) {
    return (
      <p role="alert" className="text-center text-xs text-red-700">
        Đăng nhập Google chưa được cấu hình.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <Script
        src="https://accounts.google.com/gsi/client"
        strategy="afterInteractive"
        onReady={initializeGoogle}
        onError={() => setError("Không thể tải Google Sign-In.")}
      />
      <div
        id="google-sign-in-button"
        className={isPending ? "pointer-events-none opacity-60" : undefined}
        aria-busy={isPending}
      />
      {error && (
        <p role="alert" className="text-center text-xs text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
