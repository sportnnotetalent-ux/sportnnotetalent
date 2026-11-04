/** Venue input for scheduling — the free-text ground/court name plus an optional
 *  Maps link, and a row of "reuse" chips for grounds already used elsewhere so an
 *  organizer names them consistently (which is what lets clash-detection tell two
 *  games are at the same place). Shared by the Schedule and Reschedule screens. */
import { venueMatches } from '../core/venuePick';
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../core/theme';
import { FieldLabel, TextField, SelectChip, textStyles } from './ui';

export function VenueField({
  venue,
  onVenue,
  venueUrl,
  onVenueUrl,
  knownVenues,
}: {
  venue: string;
  onVenue: (v: string) => void;
  venueUrl: string;
  onVenueUrl: (v: string) => void;
  /** grounds already used elsewhere — offered as one-tap chips */
  knownVenues: string[];
}) {
  // UI audit step 4: a search — type, pick a ground already used (any word matches)
  const suggestions = venueMatches(knownVenues, venue);
  const [pin, setPin] = React.useState(!!venueUrl);

  return (
    <View style={{ gap: theme.spacing(2) }}>
      <FieldLabel>Venue / ground</FieldLabel>
      <TextField label="" value={venue} onChange={onVenue} placeholder={knownVenues.length ? 'Search grounds you’ve used, or type a new one' : 'Main Ground'} />
      {suggestions.length > 0 && (
        <View style={st.chips}>
          {suggestions.map((v) => (
            <SelectChip key={v} label={`📍 ${v}`} active={false} onPress={() => onVenue(v)} />
          ))}
        </View>
      )}
      {pin || venueUrl ? (
        <>
          <TextField label="Google Maps link (optional)" value={venueUrl} onChange={onVenueUrl} placeholder="maps.app.goo.gl/…" autoCapitalize="none" />
          <Text style={textStyles.muted}>Paste a Maps link to pin the exact spot — otherwise we search Maps by the venue name.</Text>
        </>
      ) : (
        <Text style={st.link} accessibilityRole="button" onPress={() => setPin(true)}>＋ Add a Maps pin</Text>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  link: { color: theme.colors.primary, fontWeight: '700', fontSize: theme.font.small },
});
