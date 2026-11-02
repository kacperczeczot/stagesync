import { useEffect, useLayoutEffect, useMemo } from "react";
import { createMemoryRouter, Outlet } from "react-router";
import { RouterProvider } from "react-router/dom";
import { ContextMenuProvider } from "@stagesync/ui";
import { AdminShell } from "../shells/admin/AdminShell.js";
import { ClientShell } from "../shells/client/ClientShell.js";
import { PreferencesEventBridge } from "../shells/components/PreferencesEventBridge.js";
import { TimelineShell } from "../shells/timeline/TimelineShell.js";
import { TransportProvider } from "../transport/TransportProvider.js";
import { applyDevSurfaceMocks } from "./applyDevSurfaceMocks.js";
import {
  getDevPreviewConfig,
  resolveDevPreviewPath,
} from "./devPreviewConfig.js";
import { installDevPreviewScreenshotListener } from "./devPreviewScreenshot.js";

function DevPreviewLayout() {
  return (
    <>
      <Outlet />
      <PreferencesEventBridge />
    </>
  );
}

export function DevPreviewApp() {
  const config = getDevPreviewConfig();

  const configKey = config
    ? `${config.surface}:${config.path}:${config.session}:${config.projectId}`
    : null;

  useLayoutEffect(() => {
    if (!config) return;
    const cleanup = applyDevSurfaceMocks(config);
    return () => {
      cleanup();
    };
  }, [config, configKey]);

  useEffect(() => {
    const removeScreenshotListener = installDevPreviewScreenshotListener();
    return () => {
      removeScreenshotListener();
    };
  }, []);

  const entry = config ? resolveDevPreviewPath(config) : "/admin";
  const router = useMemo(
    () =>
      createMemoryRouter(
        [
          {
            element: <DevPreviewLayout />,
            children: [
              { path: "/admin", element: <AdminShell /> },
              { path: "/client", element: <ClientShell /> },
              { path: "/timeline", element: <TimelineShell /> },
              { path: "/timeline/:projectId", element: <TimelineShell /> },
            ],
          },
        ],
        { initialEntries: [entry] },
      ),
    [entry],
  );

  useEffect(() => {
    const onMessage = (ev: MessageEvent) => {
      if (ev.origin !== window.location.origin) return;
      if (
        ev.data &&
        ev.data.type === "stagesync-dev-preview-navigate" &&
        ev.data.path
      ) {
        router.navigate(ev.data.path);
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [router]);

  return (
    <TransportProvider>
      <ContextMenuProvider>
        <RouterProvider router={router} />
      </ContextMenuProvider>
    </TransportProvider>
  );
}
