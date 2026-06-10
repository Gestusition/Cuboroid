import * as THREE from 'three';

class ProceduralAudio {
  constructor() {
    this.context = null;
    this.masterGain = null;
    this.sfxGain = null;
    this.musicGain = null;
    this.noiseBuffer = null;
    
    // Volume levels (0.0 to 1.0)
    this.sfxVolume = Number(localStorage.getItem('cuboroid-volume-sfx') ?? 0.7);
    this.musicVolume = Number(localStorage.getItem('cuboroid-volume-music') ?? 0.5);
    
    // Music state
    this.musicTimeout = null;
    this.isPlayingMusic = false;
  }

  init() {
    if (this.context) return;
    
    // Create AudioContext
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    this.context = new AudioContextClass();
    
    // Master Gain
    this.masterGain = this.context.createGain();
    this.masterGain.gain.value = 1.0;
    this.masterGain.connect(this.context.destination);
    
    // SFX Gain
    this.sfxGain = this.context.createGain();
    this.sfxGain.gain.value = this.sfxVolume;
    this.sfxGain.connect(this.masterGain);
    
    // Music Gain
    this.musicGain = this.context.createGain();
    this.musicGain.gain.value = this.musicVolume * 0.12; // Keep music soft
    this.musicGain.connect(this.masterGain);
    
    // Generate white noise buffer
    const bufferSize = this.context.sampleRate * 2; // 2 seconds
    this.noiseBuffer = this.context.createBuffer(1, bufferSize, this.context.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    // Start background ambient music loop
    this.scheduleNextMusic();
  }

  start() {
    this.init();
    if (this.context.state === 'suspended') {
      this.context.resume();
    }
  }

  setSFXVolume(val) {
    this.sfxVolume = val;
    localStorage.setItem('cuboroid-volume-sfx', val);
    if (this.sfxGain) {
      this.sfxGain.gain.setValueAtTime(val, this.context.currentTime);
    }
  }

  setMusicVolume(val) {
    this.musicVolume = val;
    localStorage.setItem('cuboroid-volume-music', val);
    if (this.musicGain) {
      this.musicGain.gain.setValueAtTime(val * 0.12, this.context.currentTime);
    }
  }

  // Create a helper for noise source
  createNoiseNode() {
    if (!this.context) return null;
    const source = this.context.createBufferSource();
    source.buffer = this.noiseBuffer;
    return source;
  }

  // Calculate panning and volume decay for 3D sounds
  getSpatialNode(pos, playerPos, cameraRight) {
    if (!this.context) return null;
    
    const panner = this.context.createStereoPanner ? this.context.createStereoPanner() : null;
    const gain = this.context.createGain();
    
    if (pos && playerPos && cameraRight) {
      const relative = pos.clone().sub(playerPos);
      const dist = relative.length();
      
      // Volume attenuation: Max distance is 35 blocks
      const maxDist = 35;
      const volumeFactor = Math.max(0, 1 - dist / maxDist);
      gain.gain.setValueAtTime(volumeFactor, this.context.currentTime);
      
      // Pan calculation
      if (dist > 0.1 && panner) {
        const dir = relative.clone().normalize();
        const panValue = dir.dot(cameraRight);
        panner.pan.setValueAtTime(Math.max(-1, Math.min(1, panValue)), this.context.currentTime);
      }
    }
    
    return { panner, gain };
  }

  connectSpatial(nodes, destination) {
    if (!nodes) return destination;
    let current = destination;
    if (nodes.gain) {
      nodes.gain.connect(current);
      current = nodes.gain;
    }
    if (nodes.panner) {
      nodes.panner.connect(current);
      current = nodes.panner;
    }
    return current;
  }

  // Determine sound categories based on block type
  getBlockCategory(blockType) {
    switch (blockType) {
      case 'grass':
      case 'drygrass':
        return 'grass';
      case 'dirt':
      case 'podzol':
      case 'farmland':
        return 'dirt';
      case 'stone':
      case 'cobble':
      case 'brick':
      case 'coal':
      case 'iron':
        return 'stone';
      case 'wood':
      case 'planks':
      case 'cactus':
        return 'wood';
      case 'sand':
        return 'sand';
      case 'leaves':
      case 'hay':
        return 'leaves';
      case 'crystal':
        return 'crystal';
      case 'glass':
        return 'glass';
      default:
        return 'grass';
    }
  }

  // --- FOOTSTEP SOUNDS ---
  playStep(blockType, sprinting = false) {
    if (!this.context) return;
    
    const now = this.context.currentTime;
    const cat = this.getBlockCategory(blockType);
    const volumeMultiplier = sprinting ? 1.4 : 0.8;
    const pitchMultiplier = sprinting ? 1.15 : 1.0;
    
    this.synthesizeStep(cat, now, volumeMultiplier, pitchMultiplier);
  }

  synthesizeStep(category, time, volMult, pitchMult) {
    const mainGain = this.context.createGain();
    mainGain.connect(this.sfxGain);

    if (category === 'grass' || category === 'leaves') {
      // Soft rustle noise
      const noise = this.createNoiseNode();
      const filter = this.context.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(category === 'leaves' ? 1800 * pitchMult : 350 * pitchMult, time);
      filter.Q.setValueAtTime(1.5, time);
      
      const gain = this.context.createGain();
      gain.gain.setValueAtTime(0, time);
      gain.gain.linearRampToValueAtTime(0.08 * volMult, time + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.08);
      
      noise.connect(filter).connect(gain).connect(mainGain);
      noise.start(time);
      noise.stop(time + 0.1);
    } 
    else if (category === 'dirt') {
      // Low crunchy noise
      const noise = this.createNoiseNode();
      const filter = this.context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(220 * pitchMult, time);
      
      const gain = this.context.createGain();
      gain.gain.setValueAtTime(0, time);
      gain.gain.linearRampToValueAtTime(0.18 * volMult, time + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.09);
      
      noise.connect(filter).connect(gain).connect(mainGain);
      noise.start(time);
      noise.stop(time + 0.1);
    }
    else if (category === 'stone') {
      // High frequency scrape + low thump
      const noise = this.createNoiseNode();
      const filter = this.context.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1500 * pitchMult, time);
      filter.Q.setValueAtTime(1.0, time);
      
      const noiseGain = this.context.createGain();
      noiseGain.gain.setValueAtTime(0, time);
      noiseGain.gain.linearRampToValueAtTime(0.06 * volMult, time + 0.01);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, time + 0.07);
      
      noise.connect(filter).connect(noiseGain).connect(mainGain);
      noise.start(time);
      noise.stop(time + 0.08);

      // Thump
      const osc = this.context.createOscillator();
      const oscGain = this.context.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(120 * pitchMult, time);
      osc.frequency.exponentialRampToValueAtTime(60 * pitchMult, time + 0.06);
      
      oscGain.gain.setValueAtTime(0.12 * volMult, time);
      oscGain.gain.exponentialRampToValueAtTime(0.001, time + 0.06);
      
      osc.connect(oscGain).connect(mainGain);
      osc.start(time);
      osc.stop(time + 0.07);
    }
    else if (category === 'wood') {
      // Hollow low thud
      const osc = this.context.createOscillator();
      const oscGain = this.context.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(95 * pitchMult, time);
      osc.frequency.exponentialRampToValueAtTime(55 * pitchMult, time + 0.08);
      
      oscGain.gain.setValueAtTime(0.15 * volMult, time);
      oscGain.gain.exponentialRampToValueAtTime(0.001, time + 0.08);
      
      osc.connect(oscGain).connect(mainGain);
      osc.start(time);
      osc.stop(time + 0.09);

      // Add a bit of filtered wood crackle
      const noise = this.createNoiseNode();
      const filter = this.context.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(250 * pitchMult, time);
      
      const noiseGain = this.context.createGain();
      noiseGain.gain.setValueAtTime(0, time);
      noiseGain.gain.linearRampToValueAtTime(0.05 * volMult, time + 0.005);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, time + 0.05);
      
      noise.connect(filter).connect(noiseGain).connect(mainGain);
      noise.start(time);
      noise.stop(time + 0.06);
    }
    else if (category === 'sand') {
      // Sand crunch
      const noise = this.createNoiseNode();
      const filter = this.context.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(500 * pitchMult, time);
      filter.Q.setValueAtTime(2.0, time);
      
      const gain = this.context.createGain();
      gain.gain.setValueAtTime(0, time);
      gain.gain.linearRampToValueAtTime(0.14 * volMult, time + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.07);
      
      noise.connect(filter).connect(gain).connect(mainGain);
      noise.start(time);
      noise.stop(time + 0.08);
    }
    else if (category === 'crystal' || category === 'glass') {
      // Soft high chime
      const osc = this.context.createOscillator();
      const oscGain = this.context.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(category === 'glass' ? 1400 * pitchMult : 880 * pitchMult, time);
      
      oscGain.gain.setValueAtTime(0.05 * volMult, time);
      oscGain.gain.exponentialRampToValueAtTime(0.001, time + 0.1);
      
      osc.connect(oscGain).connect(mainGain);
      osc.start(time);
      osc.stop(time + 0.11);
    }
  }

  // Landing sound based on impact velocity
  playLand(blockType, impactVelocity) {
    if (!this.context) return;
    const now = this.context.currentTime;
    const cat = this.getBlockCategory(blockType);
    
    // Scale volume based on impact velocity (impact lies between ~3.0 and 20.0)
    const intensity = Math.min(1.8, Math.max(0.4, impactVelocity / 8.0));
    
    // Play a dual step-like thud with slightly lower pitch and much higher volume
    this.synthesizeStep(cat, now, intensity * 1.5, 0.85);
    this.synthesizeStep(cat, now + 0.04, intensity * 0.9, 0.75);
  }

  // --- DIGGING SOUNDS (rhythmic tapping during break progress) ---
  playDig(blockType) {
    if (!this.context) return;
    const now = this.context.currentTime;
    const cat = this.getBlockCategory(blockType);
    
    // Digging sounds are identical to step sounds but slightly shorter and faster
    this.synthesizeStep(cat, now, 0.65, 0.95);
  }

  // --- PLACE SOUNDS ---
  playPlace(blockType) {
    if (!this.context) return;
    const now = this.context.currentTime;
    const cat = this.getBlockCategory(blockType);
    
    // Placing block: low satisfying impact thunk
    this.synthesizeStep(cat, now, 1.1, 0.82);
    
    // Add extra secondary settle sound shortly after
    this.synthesizeStep(cat, now + 0.05, 0.5, 0.75);
  }

  // --- BREAK SOUNDS (explosion of crackles when block is destroyed) ---
  playBreak(blockType) {
    if (!this.context) return;
    const now = this.context.currentTime;
    const cat = this.getBlockCategory(blockType);
    
    // Major impact thud
    this.synthesizeStep(cat, now, 1.6, 0.85);
    
    // Schedule 4 tiny crackles shortly after to simulate debris scattering
    for (let i = 0; i < 4; i++) {
      const delay = 0.03 + i * 0.04 + Math.random() * 0.02;
      const vol = 0.8 - i * 0.18;
      const pitch = 0.9 + Math.random() * 0.3;
      this.synthesizeStep(cat, now + delay, vol, pitch);
    }
    
    // Extra visual flare sound for crystal / glass
    if (cat === 'crystal') {
      this.playCrystalChime(now);
    } else if (cat === 'glass') {
      this.playGlassShatter(now);
    }
  }

  playCrystalChime(time) {
    const mainGain = this.context.createGain();
    mainGain.connect(this.sfxGain);
    
    const frequencies = [660, 990, 1320, 1980];
    frequencies.forEach((freq, idx) => {
      const osc = this.context.createOscillator();
      const gain = this.context.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, time);
      
      gain.gain.setValueAtTime(0, time);
      gain.gain.linearRampToValueAtTime(0.04, time + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.4 + idx * 0.1);
      
      osc.connect(gain).connect(mainGain);
      osc.start(time);
      osc.stop(time + 0.7);
    });
  }

  playGlassShatter(time) {
    const mainGain = this.context.createGain();
    mainGain.connect(this.sfxGain);
    
    // Highpass noise burst
    const noise = this.createNoiseNode();
    const filter = this.context.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(2500, time);
    
    const gain = this.context.createGain();
    gain.gain.setValueAtTime(0.18, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.22);
    
    noise.connect(filter).connect(gain).connect(mainGain);
    noise.start(time);
    noise.stop(time + 0.25);
    
    // 3 high pitch sine cluster dings
    [2200, 3100, 4400].forEach((freq, idx) => {
      const osc = this.context.createOscillator();
      const oscGain = this.context.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq + Math.random() * 200, time);
      
      oscGain.gain.setValueAtTime(0.05, time);
      oscGain.gain.exponentialRampToValueAtTime(0.001, time + 0.12 + idx * 0.04);
      
      osc.connect(oscGain).connect(mainGain);
      osc.start(time);
      osc.stop(time + 0.2);
    });
  }

  // --- EATING (crunch loop followed by swallow) ---
  playEat(foodItem) {
    if (!this.context) return;
    const now = this.context.currentTime;
    
    // Schedule 4 chewing crunches spaced by 130ms
    for (let i = 0; i < 4; i++) {
      const timeOffset = i * 0.13;
      this.chewCrunch(now + timeOffset);
    }
    
    // Play swallow gulp sound at the end
    this.gulpSwallow(now + 4 * 0.13 + 0.05);
  }

  chewCrunch(time) {
    const osc = this.context.createOscillator();
    const noise = this.createNoiseNode();
    const filter = this.context.createBiquadFilter();
    const oscGain = this.context.createGain();
    const noiseGain = this.context.createGain();
    
    // Low triangle pop
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(90, time);
    osc.frequency.exponentialRampToValueAtTime(40, time + 0.05);
    oscGain.gain.setValueAtTime(0.08, time);
    oscGain.gain.exponentialRampToValueAtTime(0.001, time + 0.05);
    
    osc.connect(oscGain).connect(this.sfxGain);
    osc.start(time);
    osc.stop(time + 0.06);
    
    // Sharp high crunch
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1100, time);
    filter.Q.setValueAtTime(3.0, time);
    
    noiseGain.gain.setValueAtTime(0.07, time);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, time + 0.07);
    
    noise.connect(filter).connect(noiseGain).connect(this.sfxGain);
    noise.start(time);
    noise.stop(time + 0.08);
  }

  gulpSwallow(time) {
    const osc = this.context.createOscillator();
    const gain = this.context.createGain();
    const filter = this.context.createBiquadFilter();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(140, time);
    osc.frequency.exponentialRampToValueAtTime(260, time + 0.12);
    
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(350, time);
    
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(0.12, time + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.12);
    
    osc.connect(filter).connect(gain).connect(this.sfxGain);
    osc.start(time);
    osc.stop(time + 0.13);
  }

  // --- CRAFTING CLICK ---
  playCraft() {
    if (!this.context) return;
    const now = this.context.currentTime;
    
    const osc = this.context.createOscillator();
    const gain = this.context.createGain();
    
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(380, now);
    osc.frequency.exponentialRampToValueAtTime(120, now + 0.06);
    
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
    
    osc.connect(gain).connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.07);
  }

  // --- XP ORB CHIME ---
  playXpOrb() {
    if (!this.context) return;
    const now = this.context.currentTime;
    
    const osc = this.context.createOscillator();
    const gain = this.context.createGain();
    
    osc.type = 'sine';
    // Random harmonic pitch in major scale
    const pitches = [880, 990, 1100, 1320, 1485];
    const pitch = pitches[Math.floor(Math.random() * pitches.length)];
    osc.frequency.setValueAtTime(pitch, now);
    
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.08, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    
    osc.connect(gain).connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.16);
  }

  // --- LEVEL UP FANFARE ---
  playLevelUp() {
    if (!this.context) return;
    const now = this.context.currentTime;
    
    const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
    notes.forEach((freq, idx) => {
      const timeOffset = idx * 0.08;
      const playTime = now + timeOffset;
      
      const osc = this.context.createOscillator();
      const gain = this.context.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, playTime);
      
      gain.gain.setValueAtTime(0, playTime);
      gain.gain.linearRampToValueAtTime(0.12, playTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, playTime + 0.22);
      
      osc.connect(gain).connect(this.sfxGain);
      osc.start(playTime);
      osc.stop(playTime + 0.25);
    });

    // Ringing high bell chord at the end
    const chimeTime = now + 0.32;
    [1046.50, 1318.51, 1567.98].forEach((freq) => {
      const osc = this.context.createOscillator();
      const gain = this.context.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, chimeTime);
      
      gain.gain.setValueAtTime(0.06, chimeTime);
      gain.gain.exponentialRampToValueAtTime(0.001, chimeTime + 0.85);
      
      osc.connect(gain).connect(this.sfxGain);
      osc.start(chimeTime);
      osc.stop(chimeTime + 0.9);
    });
  }

  // --- HURT SOUNDS (Oof Grunt) ---
  playHurt(type = 'player', pos = null, playerPos = null, cameraRight = null) {
    if (!this.context) return;
    const now = this.context.currentTime;
    
    // Spatialization setup if mob is hurt
    const spatial = this.getSpatialNode(pos, playerPos, cameraRight);
    const destination = this.connectSpatial(spatial, this.sfxGain);
    
    if (type === 'player') {
      // Classic male "Oof" voice synthesis
      const osc = this.context.createOscillator();
      const noise = this.createNoiseNode();
      const filter = this.context.createBiquadFilter();
      const oscGain = this.context.createGain();
      const noiseGain = this.context.createGain();
      
      // Guttural vocal cord sweep
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(95, now);
      osc.frequency.exponentialRampToValueAtTime(55, now + 0.12);
      
      // Nasal voice bandpass
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(260, now);
      filter.Q.setValueAtTime(2.0, now);
      
      oscGain.gain.setValueAtTime(0.26, now);
      oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
      
      osc.connect(filter).connect(oscGain).connect(destination);
      osc.start(now);
      osc.stop(now + 0.15);
      
      // Accompanying low throat breath noise
      const noiseFilter = this.context.createBiquadFilter();
      noiseFilter.type = 'lowpass';
      noiseFilter.frequency.setValueAtTime(140, now);
      
      noiseGain.gain.setValueAtTime(0.18, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      
      noise.connect(noiseFilter).connect(noiseGain).connect(destination);
      noise.start(now);
      noise.stop(now + 0.14);
    }
  }

  // --- MOB AMBIENT VOICES ---
  playMobAmbient(mobType, mobPos, playerPos, cameraRight) {
    if (!this.context) return;
    const now = this.context.currentTime;
    
    const spatial = this.getSpatialNode(mobPos, playerPos, cameraRight);
    // Exit if too far (gain.value is 0)
    if (spatial && spatial.gain.gain.value <= 0.01) return;
    
    const destination = this.connectSpatial(spatial, this.sfxGain);
    
    if (mobType === 'sheep') {
      // sheep "baaah" bleat
      // Low sawtooth pitch with vibrato LFO
      const osc = this.context.createOscillator();
      const oscGain = this.context.createGain();
      
      const vibrato = this.context.createOscillator();
      const vibratoGain = this.context.createGain();
      
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(115, now);
      osc.frequency.linearRampToValueAtTime(105, now + 0.55);
      
      // 7.5 Hz LFO for the "baa-aa-ah" wobble
      vibrato.frequency.value = 7.5;
      vibratoGain.gain.value = 14; // vibrato depth (Hz)
      
      vibrato.connect(vibratoGain).connect(osc.frequency);
      
      // Formant filters to vocalize it to "AE" vowel
      const f1 = this.context.createBiquadFilter();
      f1.type = 'bandpass';
      f1.frequency.value = 850;
      f1.Q.value = 4.0;
      
      const f2 = this.context.createBiquadFilter();
      f2.type = 'bandpass';
      f2.frequency.value = 1750;
      f2.Q.value = 3.0;
      
      oscGain.gain.setValueAtTime(0, now);
      oscGain.gain.linearRampToValueAtTime(0.12, now + 0.08); // fade in
      oscGain.gain.setValueAtTime(0.12, now + 0.35);
      oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.6); // fade out
      
      osc.connect(f1).connect(oscGain).connect(destination);
      osc.connect(f2).connect(oscGain).connect(destination);
      
      vibrato.start(now);
      osc.start(now);
      vibrato.stop(now + 0.62);
      osc.stop(now + 0.62);
    } 
    else if (mobType === 'boar') {
      // low pig oink grunt
      const osc = this.context.createOscillator();
      const oscGain = this.context.createGain();
      const filter = this.context.createBiquadFilter();
      
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(62, now);
      osc.frequency.exponentialRampToValueAtTime(48, now + 0.28);
      
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(160, now);
      
      oscGain.gain.setValueAtTime(0, now);
      oscGain.gain.linearRampToValueAtTime(0.2, now + 0.02);
      oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
      
      osc.connect(filter).connect(oscGain).connect(destination);
      osc.start(now);
      osc.stop(now + 0.3);
    }
    else if (mobType === 'villager') {
      // Köylü resonant "Hmmmm"
      const osc = this.context.createOscillator();
      const oscGain = this.context.createGain();
      const filter = this.context.createBiquadFilter();
      
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(118, now);
      // Slight rise and drop curve
      osc.frequency.linearRampToValueAtTime(102, now + 0.12);
      osc.frequency.linearRampToValueAtTime(108, now + 0.42);
      
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(450, now);
      filter.Q.setValueAtTime(4.5, now);
      
      oscGain.gain.setValueAtTime(0, now);
      oscGain.gain.linearRampToValueAtTime(0.24, now + 0.04);
      oscGain.gain.setValueAtTime(0.24, now + 0.35);
      oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
      
      osc.connect(filter).connect(oscGain).connect(destination);
      osc.start(now);
      osc.stop(now + 0.48);
    }
    else if (mobType === 'shadow') {
      // creepy shadow demon hiss/growl
      const noise = this.createNoiseNode();
      const noiseFilter = this.context.createBiquadFilter();
      const noiseGain = this.context.createGain();
      
      noiseFilter.type = 'bandpass';
      noiseFilter.frequency.setValueAtTime(250, now);
      // sweep filter to sound like scary whispering breathe
      noiseFilter.frequency.exponentialRampToValueAtTime(800, now + 0.8);
      noiseFilter.Q.setValueAtTime(1.0, now);
      
      noiseGain.gain.setValueAtTime(0, now);
      noiseGain.gain.linearRampToValueAtTime(0.09, now + 0.25);
      noiseGain.gain.setValueAtTime(0.09, now + 0.65);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.95);
      
      noise.connect(noiseFilter).connect(noiseGain).connect(destination);
      noise.start(now);
      noise.stop(now + 1.0);
      
      // accompanying sub-bass rumble
      const osc = this.context.createOscillator();
      const oscGain = this.context.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(45, now);
      osc.frequency.linearRampToValueAtTime(35, now + 0.9);
      
      const subFilter = this.context.createBiquadFilter();
      subFilter.type = 'lowpass';
      subFilter.frequency.setValueAtTime(75, now);
      
      oscGain.gain.setValueAtTime(0, now);
      oscGain.gain.linearRampToValueAtTime(0.18, now + 0.2);
      oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.9);
      
      osc.connect(subFilter).connect(oscGain).connect(destination);
      osc.start(now);
      osc.stop(now + 0.95);
    }
  }

  // --- MOB DEATH ---
  playMobDeath(mobType, mobPos, playerPos = null, cameraRight = null) {
    if (!this.context) return;
    const now = this.context.currentTime;
    
    // Fetch active variables from global scope if not provided
    const plPos = playerPos || window.Cuboroid?.player?.position;
    const camRight = cameraRight || (window.Cuboroid?.player?.camera 
      ? new THREE.Vector3(1, 0, 0).applyQuaternion(window.Cuboroid.player.camera.quaternion) 
      : null);
      
    const spatial = this.getSpatialNode(mobPos, plPos, camRight);
    const destination = this.connectSpatial(spatial, this.sfxGain);
    
    // Play the natural sound pitched way down, followed by a dramatic crash
    this.playMobAmbient(mobType, mobPos, plPos, camRight);
    
    // Death thump
    const osc = this.context.createOscillator();
    const gain = this.context.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(80, now);
    osc.frequency.exponentialRampToValueAtTime(25, now + 0.35);
    
    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    
    osc.connect(gain).connect(destination);
    osc.start(now);
    osc.stop(now + 0.37);
  }

  // --- HIT/ATTACK SWIPE ---
  playHit(attackerType = 'player', targetEntity = null, playerPos = null, cameraRight = null) {
    if (!this.context) return;
    const now = this.context.currentTime;
    
    // Hit swipe sound
    const osc = this.context.createOscillator();
    const gain = this.context.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(1400, now);
    osc.frequency.exponentialRampToValueAtTime(120, now + 0.09);
    
    const filter = this.context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(900, now);
    
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
    
    osc.connect(filter).connect(gain).connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.1);

    // If we hit a mob, trigger their hurt grunt
    if (attackerType === 'player' && targetEntity) {
      const mobPos = targetEntity.mesh.position;
      const plPos = playerPos || window.Cuboroid?.player?.position;
      const camRight = cameraRight || (window.Cuboroid?.player?.camera 
        ? new THREE.Vector3(1, 0, 0).applyQuaternion(window.Cuboroid.player.camera.quaternion) 
        : null);
        
      // Delay it by 0.02s for realistic physical impact latency
      setTimeout(() => {
        this.playMobHurt(targetEntity.type, mobPos, plPos, camRight);
      }, 20);
    }
  }

  playMobHurt(mobType, mobPos, playerPos, cameraRight) {
    if (!this.context) return;
    const now = this.context.currentTime;
    
    const spatial = this.getSpatialNode(mobPos, playerPos, cameraRight);
    const destination = this.connectSpatial(spatial, this.sfxGain);
    
    // Grunt tone specific to mob type
    const osc = this.context.createOscillator();
    const gain = this.context.createGain();
    
    osc.type = 'sawtooth';
    
    if (mobType === 'sheep') {
      osc.frequency.setValueAtTime(160, now);
      osc.frequency.exponentialRampToValueAtTime(100, now + 0.15);
    } else if (mobType === 'boar') {
      osc.frequency.setValueAtTime(80, now);
      osc.frequency.exponentialRampToValueAtTime(50, now + 0.15);
    } else if (mobType === 'villager') {
      osc.frequency.setValueAtTime(130, now);
      osc.frequency.exponentialRampToValueAtTime(95, now + 0.22);
    } else { // shadow
      osc.frequency.setValueAtTime(55, now);
      osc.frequency.exponentialRampToValueAtTime(30, now + 0.25);
    }
    
    const filter = this.context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(mobType === 'shadow' ? 90 : 350, now);
    
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    
    osc.connect(filter).connect(gain).connect(destination);
    osc.start(now);
    osc.stop(now + 0.22);
  }

  // --- BACKGROUND MUSIC GENERATOR (calm, sparse C418-style ambient music) ---
  scheduleNextMusic() {
    // Wait between 18 and 40 seconds of silence before playing next music phrase
    const silenceSec = 18 + Math.random() * 22;
    this.musicTimeout = setTimeout(() => {
      if (!this.isPlayingMusic && this.context) {
        this.playAmbientMusicSequence();
      } else {
        this.scheduleNextMusic();
      }
    }, silenceSec * 1000);
  }

  playAmbientMusicSequence() {
    if (!this.context || this.musicVolume <= 0.01) {
      this.scheduleNextMusic();
      return;
    }
    this.isPlayingMusic = true;
    
    const now = this.context.currentTime;
    
    // A peaceful, nostalgic, sparse chord progression
    // Formatted as chords: [Root, 3rd, 5th, 7th/9th]
    const progressions = [
      // Progression 1: Fmaj9 -> Cmaj7 -> Am9 -> G6
      [
        { notes: [174.61, 220.00, 261.63, 329.63, 392.00], duration: 4 }, // F3, A3, C4, E4, G4 (Fmaj9)
        { notes: [130.81, 196.00, 246.94, 261.63, 329.63], duration: 4 }, // C3, G3, B3, C4, E4 (Cmaj7)
        { notes: [110.00, 164.81, 220.00, 293.66, 329.63], duration: 4 }, // A2, E3, A3, D4, E4 (Am7add4)
        { notes: [97.99, 146.83, 196.00, 246.94, 293.66], duration: 4 }   // G2, D3, G3, B3, D4 (G6/9)
      ],
      // Progression 2: Cmaj7 -> Em7 -> Fmaj7 -> Gsus4
      [
        { notes: [130.81, 164.81, 196.00, 246.94, 329.63], duration: 4.5 },
        { notes: [164.81, 246.94, 293.66, 329.63, 392.00], duration: 4.5 },
        { notes: [174.61, 220.00, 261.63, 349.23, 440.00], duration: 4.5 },
        { notes: [196.00, 293.66, 349.23, 392.00, 587.33], duration: 4.5 }
      ]
    ];
    
    const selected = progressions[Math.floor(Math.random() * progressions.length)];
    let cumulativeTime = 0;
    
    selected.forEach((chord) => {
      const chordStartTime = now + cumulativeTime;
      
      // Strum/Arpeggiate chord notes
      chord.notes.forEach((freq, idx) => {
        const noteTime = chordStartTime + idx * (0.08 + Math.random() * 0.06);
        this.synthesizeMusicPluck(freq, noteTime, 3.2);
      });
      
      // Randomly play a high melodic note above the chord
      if (Math.random() < 0.7) {
        const melodyPitches = chord.notes.map(n => n * 2).filter(n => n < 1200);
        if (melodyPitches.length > 0) {
          const melodyPitch = melodyPitches[Math.floor(Math.random() * melodyPitches.length)];
          const melodyTime = chordStartTime + 1.2 + Math.random() * 1.5;
          this.synthesizeMusicPluck(melodyPitch, melodyTime, 2.5);
        }
      }
      
      cumulativeTime += chord.duration + 2.0; // add silence cushion
    });
    
    // Chord sequence ends
    setTimeout(() => {
      this.isPlayingMusic = false;
      this.scheduleNextMusic();
    }, cumulativeTime * 1000);
  }

  synthesizeMusicPluck(freq, time, decayTime) {
    if (!this.context) return;
    
    const fundamental = this.context.createOscillator();
    const secondHarmonic = this.context.createOscillator();
    const filter = this.context.createBiquadFilter();
    
    const gain = this.context.createGain();
    
    // Fundamental: Triangle for soft warm bell pluck
    fundamental.type = 'triangle';
    fundamental.frequency.setValueAtTime(freq, time);
    
    // Second harmonic: Sine for metallic shine (quieter)
    secondHarmonic.type = 'sine';
    secondHarmonic.frequency.setValueAtTime(freq * 2.0, time);
    
    // Lowpass filter decay to mimic organic hammer strike on piano strings
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(750, time);
    filter.frequency.exponentialRampToValueAtTime(140, time + decayTime * 0.8);
    
    gain.gain.setValueAtTime(0, time);
    // Soft attack
    gain.gain.linearRampToValueAtTime(0.14, time + 0.04);
    // Slow decay
    gain.gain.exponentialRampToValueAtTime(0.001, time + decayTime);
    
    // Connect harmonics
    const blendGain = this.context.createGain();
    blendGain.gain.setValueAtTime(0.25, time); // quiet second harmonic
    
    fundamental.connect(filter);
    secondHarmonic.connect(blendGain).connect(filter);
    
    filter.connect(gain).connect(this.musicGain);
    
    fundamental.start(time);
    secondHarmonic.start(time);
    
    fundamental.stop(time + decayTime + 0.1);
    secondHarmonic.stop(time + decayTime + 0.1);
  }

  // Stop music scheduling on exit or pause
  stopAll() {
    clearTimeout(this.musicTimeout);
    if (this.context) {
      this.context.suspend();
    }
  }
}

export const audio = new ProceduralAudio();
// Expose on window for easy access from other scripts if necessary
window.audio = audio;
