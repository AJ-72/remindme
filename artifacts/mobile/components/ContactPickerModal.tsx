import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { Linking } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { getLocales } from "expo-localization";
import { useColors } from "@/hooks/useColors";
import { callingCodeForRegion } from "@/utils/phoneNumber";
import { getFontFamily } from "@/utils/getFontFamily";
import {
  getContactsPermissionState,
  loadPickableContacts,
  searchContacts,
  type ContactsPermission,
  type PickableContact,
} from "@/services/ContactsService";

interface Props {
  visible: boolean;
  onSelect: (contact: PickableContact) => void;
  onClose: () => void;
}

/** Enough digits to be a phone number anywhere, without guessing a format. */
const MIN_MANUAL_DIGITS = 6;

/**
 * The country code is asked for, never guessed. `normalizeForIdentity()` falls
 * back to the DEVICE REGION when a number carries no `+`, and the device region
 * is the phone's locale, not its SIM - an en-GB handset on an Indian SIM
 * normalizes the same digits to a different E.164 number, and therefore to a
 * different phone_hash, than the sender expects. A typed number that already
 * carries its own `+` never reaches that branch.
 */
const DEFAULT_CALLING_CODE = "+91";

export default function ContactPickerModal({ visible, onSelect, onClose }: Props) {
  const colors = useColors();
  const [contacts, setContacts] = useState<PickableContact[]>([]);
  const [permission, setPermission] = useState<ContactsPermission | null>(null);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  // The app's own ask, shown BEFORE the system dialog. The system dialog
  // gives one chance and no reason; this one carries the reason, and a
  // refusal here costs nothing, because the OS was never asked.
  const [askFirst, setAskFirst] = useState(false);
  // The way through that needs no address book at all.
  const [manual, setManual] = useState(false);
  const [manualName, setManualName] = useState("");
  const [manualPhone, setManualPhone] = useState("");
  const [manualCode, setManualCode] = useState(
    () => callingCodeForRegion(getLocales()[0]?.regionCode) ?? DEFAULT_CALLING_CODE
  );

  // Only touch the address book once the sheet is actually open - asking for
  // contacts permission on a screen the user never opened is exactly the kind
  // of prompt that gets an app one-starred.
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setLoading(true);
    setQuery("");
    setManual(false);
    setManualName("");
    setManualPhone("");
    setPermission(null);
    (async () => {
      const state = await getContactsPermissionState();
      if (cancelled) return;
      if (!state.granted) {
        // Nothing is asked of the OS yet. Either explain first, or - once the
        // OS has stopped asking - go straight to the repair path.
        setAskFirst(state.canAskAgain);
        setPermission(state.canAskAgain ? null : "blocked");
        setLoading(false);
        return;
      }
      setAskFirst(false);
      const result = await loadPickableContacts({ request: false });
      if (cancelled) return;
      setContacts(result.contacts);
      setPermission(result.permission);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [visible]);

  async function requestAndLoad() {
    setAskFirst(false);
    setLoading(true);
    const result = await loadPickableContacts({ request: true });
    setContacts(result.contacts);
    setPermission(result.permission);
    setLoading(false);
  }

  const manualDigits = manualPhone.replace(/\D/g, "");
  const manualCodeDigits = manualCode.replace(/\D/g, "");
  const manualUsable =
    manualDigits.length >= MIN_MANUAL_DIGITS && manualCodeDigits.length > 0;

  function submitManual() {
    if (!manualUsable) return;
    // Joined into one E.164 string here, so everything downstream - the
    // reachability lookup, the invitation, the WhatsApp link - sees the same
    // explicit number the user typed.
    const phone = `+${manualCodeDigits}${manualDigits}`;
    onSelect({ name: manualName.trim() || phone, phone });
  }

  const filtered = useMemo(
    () => searchContacts(contacts, query),
    [contacts, query]
  );

  const styles = StyleSheet.create({
    flex: { flex: 1 },
    overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
    sheet: {
      backgroundColor: colors.card,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      paddingTop: 12,
      paddingBottom: Platform.OS === "ios" ? 40 : 28,
      maxHeight: "80%",
    },
    handle: {
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.muted,
      alignSelf: "center",
      marginBottom: 12,
    },
    headerRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 20,
      marginBottom: 12,
    },
    title: { flex: 1, fontSize: 17, fontWeight: "600", color: colors.foreground },
    cancel: { fontSize: 15, color: colors.primary, paddingVertical: 4, paddingLeft: 12 },
    searchWrap: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor: colors.muted,
      borderRadius: 12,
      paddingHorizontal: 12,
      marginHorizontal: 20,
      marginBottom: 8,
    },
    search: { flex: 1, paddingVertical: 10, fontSize: 15, color: colors.foreground },
    row: {
      paddingVertical: 12,
      paddingHorizontal: 20,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    name: { fontSize: 15, color: colors.foreground },
    phone: { fontSize: 13, color: colors.mutedForeground, marginTop: 2 },
    stateWrap: { padding: 32, alignItems: "center", gap: 10 },
    stateTitle: {
      fontSize: 15,
      fontWeight: "600",
      color: colors.foreground,
      textAlign: "center",
    },
    stateBody: {
      fontSize: 13,
      color: colors.mutedForeground,
      textAlign: "center",
      lineHeight: 19,
    },
    primaryBtn: {
      backgroundColor: colors.primary,
      borderRadius: 12,
      paddingVertical: 12,
      paddingHorizontal: 20,
      marginTop: 6,
      alignSelf: "stretch",
      alignItems: "center",
    },
    primaryBtnDisabled: { backgroundColor: colors.muted },
    primaryBtnText: {
      fontSize: 15,
      fontFamily: "Inter_600SemiBold",
      color: colors.primaryForeground,
    },
    primaryBtnTextDisabled: { color: colors.mutedForeground },
    linkBtnText: {
      fontSize: 14,
      fontFamily: "Inter_500Medium",
      color: colors.primary,
      paddingVertical: 8,
    },
    manualWrap: { paddingHorizontal: 20, paddingBottom: 8, gap: 10 },
    manualField: {
      backgroundColor: colors.muted,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 15,
      color: colors.foreground,
    },
    manualHint: { fontSize: 12, color: colors.mutedForeground },
    manualPhoneRow: { flexDirection: "row", gap: 8 },
    manualCodeField: { width: 78, textAlign: "center" },
    manualNumberField: { flex: 1 },
  });

  function renderManual() {
    return (
      <View style={styles.manualWrap} testID="contacts-manual">
        <Text style={styles.manualHint}>
          Type the name and number yourself, with the country code. Nothing is
          read from your phone.
        </Text>
        <TextInput
          testID="contacts-manual-name"
          style={styles.manualField}
          placeholder="Name (optional)"
          placeholderTextColor={colors.mutedForeground}
          value={manualName}
          onChangeText={setManualName}
        />
        <View style={styles.manualPhoneRow}>
          <TextInput
            testID="contacts-manual-code"
            style={[styles.manualField, styles.manualCodeField]}
            placeholder="+91"
            placeholderTextColor={colors.mutedForeground}
            value={manualCode}
            onChangeText={setManualCode}
            keyboardType="phone-pad"
            autoCorrect={false}
            accessibilityLabel="Country code"
          />
          <TextInput
            testID="contacts-manual-phone"
            style={[styles.manualField, styles.manualNumberField]}
            placeholder="Phone number"
            placeholderTextColor={colors.mutedForeground}
            value={manualPhone}
            onChangeText={setManualPhone}
            keyboardType="phone-pad"
            autoCorrect={false}
            accessibilityLabel="Phone number"
          />
        </View>
        <Pressable
          testID="contacts-manual-submit"
          disabled={!manualUsable}
          onPress={submitManual}
          style={[styles.primaryBtn, !manualUsable && styles.primaryBtnDisabled]}
        >
          <Text
            style={[
              styles.primaryBtnText,
              !manualUsable && styles.primaryBtnTextDisabled,
            ]}
          >
            Use this number
          </Text>
        </Pressable>
      </View>
    );
  }

  /** The escape hatch every refusal state offers. */
  function manualLink() {
    return (
      <Pressable testID="contacts-use-manual" onPress={() => setManual(true)} hitSlop={8}>
        <Text style={styles.linkBtnText}>Type a number instead</Text>
      </Pressable>
    );
  }

  function renderBody() {
    if (manual) return renderManual();

    if (loading) {
      return (
        <View style={styles.stateWrap}>
          <ActivityIndicator color={colors.primary} />
        </View>
      );
    }

    // The app's own ask, before the system dialog. The OS gives one chance
    // and no reason, so the reason goes here, where a "no" costs the user
    // nothing that cannot be undone.
    if (askFirst) {
      return (
        <View style={styles.stateWrap} testID="contacts-pre-prompt">
          <Feather name="users" size={28} color={colors.primary} />
          <Text style={styles.stateTitle}>Pick them from your contacts?</Text>
          <Text style={styles.stateBody}>
            Reminders fills in the name and number for you. Your contacts stay
            on your phone. Nothing is uploaded and nothing is stored except the
            one person you choose.
          </Text>
          <Pressable
            testID="contacts-pre-prompt-continue"
            onPress={requestAndLoad}
            style={styles.primaryBtn}
          >
            <Text style={styles.primaryBtnText}>Choose from contacts</Text>
          </Pressable>
          {manualLink()}
        </View>
      );
    }

    // Refused just now, and the OS will still ask again. Asking twice in a
    // row is nagging, so the retry is a button the user presses, not a dialog.
    if (permission === "denied") {
      return (
        <View style={styles.stateWrap} testID="contacts-denied">
          <Feather name="user-x" size={28} color={colors.mutedForeground} />
          <Text style={styles.stateTitle}>No contact access</Text>
          <Text style={styles.stateBody}>
            That is fine - you can type the number yourself. If you change your
            mind, you can let Reminders read your contacts instead.
          </Text>
          <Pressable
            testID="contacts-denied-retry"
            onPress={requestAndLoad}
            style={styles.primaryBtn}
          >
            <Text style={styles.primaryBtnText}>Allow contacts</Text>
          </Pressable>
          {manualLink()}
        </View>
      );
    }

    // The OS has stopped asking. A retry button here would be the dead button
    // this whole state exists to remove, so the only route left is settings.
    if (permission === "blocked") {
      return (
        <View style={styles.stateWrap} testID="contacts-blocked">
          <Feather name="lock" size={28} color={colors.mutedForeground} />
          <Text style={styles.stateTitle}>Contacts are turned off</Text>
          <Text style={styles.stateBody}>
            Your phone will not ask again. You can turn contacts on for
            Reminders in system settings, or just type the number.
          </Text>
          <Pressable
            testID="contacts-open-settings"
            onPress={() => {
              try {
                Linking.openSettings();
              } catch {
                // Nothing left to offer here; the manual route stays below.
              }
            }}
            style={styles.primaryBtn}
          >
            <Text style={styles.primaryBtnText}>Open settings</Text>
          </Pressable>
          {manualLink()}
        </View>
      );
    }

    // Nobody refused anything - the address book itself failed. Say that,
    // rather than accusing the user of a refusal they never made.
    if (permission === "error") {
      return (
        <View style={styles.stateWrap} testID="contacts-error">
          <Feather name="alert-circle" size={28} color={colors.mutedForeground} />
          <Text style={styles.stateTitle}>Couldn't read your contacts</Text>
          <Text style={styles.stateBody}>
            Something went wrong on this phone, not with your permission. Try
            again, or type the number.
          </Text>
          <Pressable
            testID="contacts-error-retry"
            onPress={requestAndLoad}
            style={styles.primaryBtn}
          >
            <Text style={styles.primaryBtnText}>Try again</Text>
          </Pressable>
          {manualLink()}
        </View>
      );
    }

    if (contacts.length === 0) {
      return (
        <View style={styles.stateWrap} testID="contacts-empty">
          <Feather name="users" size={28} color={colors.mutedForeground} />
          <Text style={styles.stateTitle}>No contacts with phone numbers</Text>
          <Text style={styles.stateBody}>
            Add someone to your phone's contacts, then come back.
          </Text>
          {manualLink()}
        </View>
      );
    }

    if (filtered.length === 0) {
      return (
        <View style={styles.stateWrap} testID="contacts-no-results">
          <Text style={styles.stateBody}>No contacts match "{query}".</Text>
          {manualLink()}
        </View>
      );
    }

    return (
      <FlatList
        data={filtered}
        keyExtractor={(item, i) => `${item.contactId ?? "x"}-${item.phone}-${i}`}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => (
          <Pressable style={styles.row} onPress={() => onSelect(item)}>
            <Text
              style={[
                styles.name,
                { fontFamily: getFontFamily(item.name, "400Regular") },
              ]}
            >
              {item.name}
            </Text>
            <Text style={styles.phone}>{item.phone}</Text>
          </Pressable>
        )}
      />
    );
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      {/* The sheet is anchored to the bottom of the screen, which is exactly
          where the keyboard opens. Without this the search field's own
          keyboard covers the results - and with only a couple of matches the
          sheet is short enough to be hidden entirely.
          react-native-keyboard-controller's version, not React Native's:
          RN's KeyboardAvoidingView is unreliable inside an Android Modal,
          which renders in its own window and does not reliably receive the
          soft-input resize. Already a dependency (see KeyboardProvider in
          app/_layout.tsx), so this costs nothing. */}
      <KeyboardAvoidingView behavior="padding" style={styles.flex}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.handle} />
          <View style={styles.headerRow}>
            <Text style={styles.title}>
              {manual ? "Type a number" : "Choose a contact"}
            </Text>
            <Pressable onPress={onClose} testID="contact-picker-cancel" hitSlop={8}>
              <Text style={styles.cancel}>Cancel</Text>
            </Pressable>
          </View>

          {permission === "granted" && !manual && contacts.length > 0 && (
          <View style={styles.searchWrap}>
            <Feather name="search" size={16} color={colors.mutedForeground} />
            <TextInput
              testID="contact-search"
              style={styles.search}
              placeholder="Search name or number"
              placeholderTextColor={colors.mutedForeground}
              value={query}
              onChangeText={setQuery}
              autoCorrect={false}
            />
          </View>
          )}

          {renderBody()}
        </Pressable>
      </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}
