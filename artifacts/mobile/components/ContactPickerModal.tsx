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
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useColors } from "@/hooks/useColors";
import { getFontFamily } from "@/utils/getFontFamily";
import {
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

export default function ContactPickerModal({ visible, onSelect, onClose }: Props) {
  const colors = useColors();
  const [contacts, setContacts] = useState<PickableContact[]>([]);
  const [permission, setPermission] = useState<ContactsPermission | null>(null);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");

  // Only touch the address book once the sheet is actually open - asking for
  // contacts permission on a screen the user never opened is exactly the kind
  // of prompt that gets an app one-starred.
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setLoading(true);
    setQuery("");
    loadPickableContacts().then((result) => {
      if (cancelled) return;
      setContacts(result.contacts);
      setPermission(result.permission);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [visible]);

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
  });

  function renderBody() {
    if (loading) {
      return (
        <View style={styles.stateWrap}>
          <ActivityIndicator color={colors.primary} />
        </View>
      );
    }

    if (permission === "denied" || permission === "error") {
      return (
        <View style={styles.stateWrap} testID="contacts-denied">
          <Feather name="user-x" size={28} color={colors.mutedForeground} />
          <Text style={styles.stateTitle}>Contacts aren't available</Text>
          <Text style={styles.stateBody}>
            Reminders needs access to your contacts to pick who a reminder is
            about. Your contacts never leave your phone. You can turn this on in
            your device settings.
          </Text>
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
        </View>
      );
    }

    if (filtered.length === 0) {
      return (
        <View style={styles.stateWrap} testID="contacts-no-results">
          <Text style={styles.stateBody}>No contacts match "{query}".</Text>
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
            <Text style={styles.title}>Choose a contact</Text>
            <Pressable onPress={onClose} testID="contact-picker-cancel" hitSlop={8}>
              <Text style={styles.cancel}>Cancel</Text>
            </Pressable>
          </View>

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

          {renderBody()}
        </Pressable>
      </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}
