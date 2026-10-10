export interface RelativePosition {
  x: number;
  y: number;
}

export interface OverlayPositions {
  fab: RelativePosition | null;
  dodge: RelativePosition | null;
}

export type StreamingMode = 'off' | 'on' | 'auto';

export interface DrakeSettings {
  auto_accept: boolean;
  run_at_startup: boolean;
  auto_reload_on_open: boolean;
  auto_accept_delay_ms: number;
  unlock_status_message: boolean;
  presence_availability: string;
  auto_pick: boolean;
  auto_pick_by_role: Record<string, number[]>;
  insta_lock: boolean;
  auto_ban: boolean;
  auto_ban_champion_id: number;
  auto_update: boolean;
  analytics_enabled: boolean;
  queue_team_reveal_in_client: boolean;
  queue_dodge_in_client: boolean;
  queue_show_map_side: boolean;
  queue_mute_all_in_client: boolean;
  queue_auto_message: string;
  queue_team_reveal_sample_size: number;
  queue_team_reveal_recent_pool: string;
  queue_team_reveal_fetch_concurrency: number;
  profile_rank_tier: string;
  profile_rank_division: string;
  profile_rank_queue: string;
  profile_rank_crystal: string;
  onboarding_done: boolean;
  whats_new_seen_version: string;
  build_tier: string;
  build_region: string;
  ui_language: string;
  overlay_positions: OverlayPositions;
  overlay_hint_seen: boolean;
  streaming_mode: StreamingMode;
}

export type SettingsValues = Partial<DrakeSettings>;

export type SettingsPatch = Partial<DrakeSettings>;

export interface PluginConfig {
  token: string;
  port: number;
  version: string;
  settings: SettingsValues;
  streaming_effective?: string;
  streaming_tool_running?: boolean;
}
