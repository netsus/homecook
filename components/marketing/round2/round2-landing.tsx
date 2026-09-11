"use client";
import React, { useEffect, useState, useSyncExternalStore } from "react";
import { createRound2Client, type Round2ClientOptions } from "@/lib/marketing/round2-client";
import { Round2View } from "./round2-view";
export type Round2LandingProps = Pick<Round2ClientOptions, "topic" | "pageContext" | "attribution" | "preview" | "leadReady"> & {
    turnstileSiteKey: string;
};
export function Round2Landing(props: Round2LandingProps) {
    const [client] = useState(() => createRound2Client(props));
    const [initial] = useState(() => client.getState());
    const [lifecycle] = useState(() => ({ generation: 0 }));
    const state = useSyncExternalStore(client.subscribe, client.getState, () => initial);
    useEffect(() => {
        const generation = ++lifecycle.generation;
        void client.connect();
        const resume = () => {
            if (document.visibilityState === "visible")
                void client.connect();
        };
        window.addEventListener("pageshow", resume);
        window.addEventListener("popstate", resume);
        document.addEventListener("visibilitychange", resume);
        return () => {
            window.removeEventListener("pageshow", resume);
            window.removeEventListener("popstate", resume);
            document.removeEventListener("visibilitychange", resume);
            queueMicrotask(() => {
                if (lifecycle.generation === generation)
                    client.dispose();
            });
        };
    }, [client, lifecycle]);
    return <Round2View {...props} state={state} actions={client}/>;
}
