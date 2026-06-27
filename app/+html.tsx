import { ScrollViewStyleReset } from "expo-router/html";
import type { PropsWithChildren } from "react";

export default function Html({ children }: PropsWithChildren) {
  return (
    <html lang="pt-BR">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1, minimum-scale=1, user-scalable=no, shrink-to-fit=no, viewport-fit=cover"
        />
        <meta name="theme-color" content="#171A20" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Oasis Validador" />
        <meta name="application-name" content="Oasis Validador" />
        <meta name="description" content="Validador administrativo de ingressos do Clube Oasis." />
        <link rel="manifest" href="/manifest.json" />
        <link rel="icon" href="/favicon.png" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <ScrollViewStyleReset />
        <style
          dangerouslySetInnerHTML={{
            __html: `
              html,
              body,
              #root {
                width: 100%;
                height: 100%;
                min-height: 100%;
                margin: 0;
                overflow: hidden;
                overscroll-behavior: none;
                background: #0D0F13;
                -webkit-text-size-adjust: 100%;
                text-size-adjust: 100%;
              }

              @supports (height: 100dvh) {
                html,
                body,
                #root {
                  height: 100dvh;
                  min-height: 100dvh;
                }
              }

              body {
                position: fixed;
                inset: 0;
                touch-action: manipulation;
                -webkit-tap-highlight-color: transparent;
                -webkit-user-select: none;
                user-select: none;
              }

              #root {
                display: flex;
                min-width: 0;
              }

              #root > * {
                flex: 1 1 auto;
                min-width: 0;
                min-height: 0;
              }

              *,
              *::before,
              *::after {
                box-sizing: border-box;
              }

              input,
              textarea,
              select,
              [contenteditable="true"] {
                font-size: 16px !important;
                -webkit-user-select: text;
                user-select: text;
              }
            `,
          }}
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              document.addEventListener("gesturestart", function (event) {
                event.preventDefault();
              }, { passive: false });
            `,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
