// src/components/StreamingLoopPlayer.tsx
// Hidden Video component for streaming audio loop playback
// Renders as invisible but provides native streaming capabilities

import React, {useEffect, useRef} from 'react';
import {View, StyleSheet} from 'react-native';
import Video from 'react-native-video';
import StreamingLoopService from '../services/streamingLoop';

/**
 * Streaming Loop Player Component
 *
 * Invisible component that provides native streaming playback
 * for large audio files that would exceed memory limits if decoded.
 *
 * This component must be rendered somewhere in the app tree
 * (typically in App.tsx) for streaming playback to work.
 */
const StreamingLoopPlayer: React.FC = () => {
  const videoRef = useRef<any>(null);
  const [isPlaying, setIsPlaying] = React.useState(false);
  const [currentUrl, setCurrentUrl] = React.useState<string | null>(null);

  useEffect(() => {
    // Register player with service
    StreamingLoopService.registerPlayer(videoRef);

    // Register status change callback
    StreamingLoopService.setPlaybackStatusCallback((playing: boolean) => {
      setIsPlaying(playing);
      if (playing) {
        setCurrentUrl(StreamingLoopService.getCurrentUrl());
      } else {
        setCurrentUrl(null);
      }
    });

    // Cleanup on unmount
    return () => {
      StreamingLoopService.unregisterPlayer();
      StreamingLoopService.setPlaybackStatusCallback(() => {});
    };
  }, []);

  if (!isPlaying || !currentUrl) {
    return null; // Nothing to render when not playing
  }

  return (
    <View style={styles.container}>
      <Video
        ref={videoRef}
        source={{uri: currentUrl}}
        repeat={true}
        paused={false}
        volume={StreamingLoopService.getVolume()}
        playInBackground={true}
        playWhenInactive={true}
        onError={(error: any) => StreamingLoopService.handleError(error)}
        onEnd={() => StreamingLoopService.handleEnd()}
        onLoad={(data: any) => StreamingLoopService.handleLoad(data)}
        style={styles.hidden}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    width: 0,
    height: 0,
    opacity: 0,
  },
  hidden: {
    width: 0,
    height: 0,
  },
});

export default StreamingLoopPlayer;
