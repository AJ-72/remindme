import { useEffect } from "react";
import { AppState } from "react-native";
import { router } from "expo-router";

import { checkForInvitations, type ClaimedInvitation } from "@/services/InvitationService";

/**
 * Closes the gap where a pending invitation only surfaced by re-running
 * bind-invite/register-number: an already-bound user had no path back to
 * claimPendingInvitations() at all, so a reminder sent to them after their
 * one-time registration/bind was invisible until they went through one of
 * those screens again (confirmed live on a two-device test).
 *
 * Mirrors the existing exact-alarm-permission check already in
 * _layout.tsx: once on mount (cold start / app relaunch) and again on every
 * AppState transition to "active" (foreground resume) - not on every
 * transition, since backgrounding needs no check of its own.
 *
 * Navigation only fires for exactly one claimed invitation, matching
 * checkForInvitations()'s own rule (see InvitationService.ts) - more than
 * one defers to the still-unbuilt list screen.
 */
export function navigateToInvitationPreview(invitation: ClaimedInvitation) {
  router.push({
    pathname: "/invitation-preview",
    params: {
      id: invitation.id,
      title: invitation.title,
      description: invitation.description,
      datetime: invitation.datetime,
      senderId: invitation.senderId,
    },
  });
}

export function useInvitationCheck(): void {
  useEffect(() => {
    checkForInvitations(navigateToInvitationPreview);

    const sub = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        checkForInvitations(navigateToInvitationPreview);
      }
    });
    return () => sub.remove();
  }, []);
}
