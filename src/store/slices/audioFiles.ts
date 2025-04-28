// src/store/slices/audioFiles.ts

import {createSlice, PayloadAction} from '@reduxjs/toolkit';
import {AudioFile} from '../../services/audio';

interface AudioFilesState {
  files: AudioFile[];
  currentFileId: string | null;
  loading: boolean;
  error: string | null;
}

const initialState: AudioFilesState = {
  files: [],
  currentFileId: null,
  loading: false,
  error: null,
};

const audioFilesSlice = createSlice({
  name: 'audioFiles',
  initialState,
  reducers: {
    setFiles(state, action: PayloadAction<AudioFile[]>) {
      state.files = action.payload;
      state.loading = false;
      state.error = null;
    },
    addFile(state, action: PayloadAction<AudioFile>) {
      state.files.push(action.payload);
    },
    updateFile(
      state,
      action: PayloadAction<Partial<AudioFile> & {id: string}>,
    ) {
      const index = state.files.findIndex(
        file => file.id === action.payload.id,
      );
      if (index !== -1) {
        state.files[index] = {...state.files[index], ...action.payload};
      }
    },
    removeFile(state, action: PayloadAction<string>) {
      state.files = state.files.filter(file => file.id !== action.payload);
      if (state.currentFileId === action.payload) {
        state.currentFileId = null;
      }
    },
    setCurrentFile(state, action: PayloadAction<string | null>) {
      state.currentFileId = action.payload;
    },
    setLoading(state, action: PayloadAction<boolean>) {
      state.loading = action.payload;
    },
    setError(state, action: PayloadAction<string | null>) {
      state.error = action.payload;
      state.loading = false;
    },
  },
});

// Export actions
export const {
  setFiles,
  addFile,
  updateFile,
  removeFile,
  setCurrentFile,
  setLoading,
  setError,
} = audioFilesSlice.actions;

// Export reducer
export default audioFilesSlice.reducer;
