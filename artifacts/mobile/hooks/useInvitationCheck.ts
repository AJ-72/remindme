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

/**
 * B15: routes 2+ concurrently-claimed invitations to the pending-list screen
 * instead of the previous silent no-op. Passed as JSON in a single param
 * rather than one param per field (as navigateToInvitationPreview does for
 * a single invitation) - expo-router params are flat strings, and a list's
 * shape doesn't fit that without either N indexed params or one serialized
 * blob; a small list of a few invitations stays well under any router URL
 * length concern.
 */
export function navigateToPendingList(invitations: ClaimedInvitation[]) {
  router.push({
    pathname: "/pending-invitations",
    params: { invitations: JSON.stringify(invitations) },
  });
}

export function useInvitationCheck(): void {
  useEffect(() => {
    checkForInvitations(navigateToInvitationPreview, navigateToPendingList);

    const sub = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        checkForInvitations(navigateToInvitationPreview, navigateToPendingList);
      }
    });
    return () => sub.remove();
  }, []);
}
