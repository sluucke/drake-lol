import { CHECKBOX_SPRITE } from '../../ui/assets.js';
import drakeSprite from '../../../assets/drake-spritesheet.png';
import tokens from './tokens.css';
import base from './base.css';
import button from '../ui/Button.css';
import card from '../ui/Card.css';
import toggle from '../ui/Toggle.css';
import select from '../ui/Select.css';
import tabs from '../ui/Tabs.css';
import modal from '../ui/Modal.css';
import tooltip from '../ui/Tooltip.css';
import skeleton from '../ui/Skeleton.css';
import slider from '../ui/Slider.css';
import shell from '../shell/shell.css';
import segmented from '../ui/Segmented.css';
import textInput from '../ui/TextInput.css';
import screens from '../screens/screens.css';
import champions from '../screens/champions/champions.css';
import profile from '../screens/profile/profile.css';
import onboarding from '../shell/onboarding.css';
import scouting from '../overlays/scouting/scouting.css';
import build from '../overlays/build/build.css';
import docks from '../overlays/docks/docks.css';

const assetTokens = `:host { --checkbox-sprite: url("${CHECKBOX_SPRITE}"); --drake-sprite: url("${drakeSprite}"); }`;

export const APP_STYLES = [tokens, assetTokens, base, button, card, toggle, select, tabs, modal, tooltip, skeleton, slider, shell, segmented, textInput, screens, champions, profile, onboarding, scouting, build, docks];
