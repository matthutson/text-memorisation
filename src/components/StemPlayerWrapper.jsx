import React, { useCallback, useEffect, useRef, useState } from 'react';
import '../stemplayer/index.js';
import { supabase } from '../utils/supabase';
import { updateText } from '../utils/storage';

const StemPlayerWrapper = ({ stems = [], setStems, textId, isDarkMode, onStemsUpdate, isVisible = true, onPlayerReady }) => {
    const [isUploading, setIsUploading] = useState(false);
    const [bucketStatus, setBucketStatus] = useState('checking'); // 'checking', 'ready', 'error'
    const [bucketError, setBucketError] = useState(null);
    const playerRef = useRef(null);

    // Hand the player element to the transport bar, which owns playback,
    // looping and speed so the lyrics stay visible while you practise
    const attachPlayer = useCallback((node) => {
        playerRef.current = node;
        if (onPlayerReady) onPlayerReady(node);
    }, [onPlayerReady]);

    useEffect(() => {
        // Debug: Log textId to verify it's being passed correctly
        console.log('[StemPlayerWrapper] Component mounted with textId:', textId);
        console.log('[StemPlayerWrapper] Initial stems:', stems);

        // Check if stems bucket exists and list buckets
        const checkBucket = async () => {
            try {
                // First, list all buckets to see what's available
                const { data: buckets, error: listError } = await supabase.storage.listBuckets();
                if (listError) {
                    console.error('[StemPlayerWrapper] Error listing buckets:', listError);
                } else {
                    console.log('[StemPlayerWrapper] Available buckets:', buckets);
                }

                // Then check the specific stems bucket
                const { data, error } = await supabase.storage.getBucket('stems');
                if (error) {
                    console.error('[StemPlayerWrapper] Stems bucket does not exist or is not accessible:', error);
                    console.log('[StemPlayerWrapper] Please create a storage bucket named "stems" in your Supabase dashboard');
                    console.log('[StemPlayerWrapper] Go to: Storage > New bucket > Name: stems, Public: true');
                    console.log('[StemPlayerWrapper] Instructions:');
                    console.log('[StemPlayerWrapper] 1. Go to https://quxjesuarzbqqoahogma.supabase.co');
                    console.log('[StemPlayerWrapper] 2. Navigate to Storage');
                    console.log('[StemPlayerWrapper] 3. Click "New bucket"');
                    console.log('[StemPlayerWrapper] 4. Name: stems');
                    console.log('[StemPlayerWrapper] 5. Public bucket: ON');
                    console.log('[StemPlayerWrapper] 6. File size limit: 50MB (or higher for large audio files)');
                    console.log('[StemPlayerWrapper] 7. See SUPABASE_SETUP.md for detailed RLS policy configuration');

                    setBucketStatus('error');
                    setBucketError('Storage bucket "stems" not found. See console and SUPABASE_SETUP.md for setup instructions.');
                } else {
                    console.log('[StemPlayerWrapper] Stems bucket found:', data);
                    setBucketStatus('ready');
                    setBucketError(null);
                }
            } catch (err) {
                console.error('[StemPlayerWrapper] Error checking bucket:', err);
                setBucketStatus('error');
                setBucketError('Failed to connect to storage. Check console for details.');
            }
        };
        checkBucket();
    }, []);

    const handleFileUpload = async (event) => {
        const files = Array.from(event.target.files);
        if (!files.length) return;

        // Validate textId exists
        if (!textId) {
            console.error('[StemPlayerWrapper] Cannot upload: textId is undefined');
            alert('Error: Cannot upload stems - text ID is missing. Please make sure you have saved this text first.');
            event.target.value = '';
            return;
        }

        console.log('[StemPlayerWrapper] Starting upload of', files.length, 'file(s) for textId:', textId);
        setIsUploading(true);

        try {
            const newStems = [];

            for (const file of files) {
                console.log('[StemPlayerWrapper] Uploading file:', file.name, 'size:', file.size, 'type:', file.type);

                // Sanitize filename to remove invalid characters
                // Supabase Storage doesn't allow: [ ] and other special characters
                const sanitizedFileName = file.name.replace(/[\[\]]/g, '_').replace(/[^a-zA-Z0-9._-]/g, '_');

                // 1. Upload file to Supabase Storage
                const fileName = `${textId}/${Date.now()}-${sanitizedFileName}`;
                console.log('[StemPlayerWrapper] Storage path:', fileName);

                const { data, error } = await supabase.storage
                    .from('stems')
                    .upload(fileName, file, {
                        cacheControl: '3600',
                        upsert: false
                    });

                if (error) {
                    console.error('[StemPlayerWrapper] Upload error for', file.name, ':', error);
                    console.error('[StemPlayerWrapper] Error details:', JSON.stringify(error, null, 2));

                    let errorMessage = `Failed to upload ${file.name}: ${error.message}`;

                    // Provide specific guidance based on error type
                    if (error.message?.includes('new row violates row-level security policy') ||
                        error.message?.includes('permission') ||
                        error.message?.includes('policy')) {
                        errorMessage += '\n\nPossible issue: Storage bucket permissions are not configured correctly.';
                        errorMessage += '\nPlease check your Supabase storage bucket policies.';
                    } else if (error.message?.includes('not found') || error.message?.includes('does not exist')) {
                        errorMessage += '\n\nThe "stems" bucket does not exist.';
                        errorMessage += '\nPlease create it in your Supabase dashboard (Storage > New bucket > Name: stems, Public: ON).';
                    }

                    alert(errorMessage);
                    continue;
                }

                console.log('[StemPlayerWrapper] Upload successful:', data);

                // 2. Get public URL
                const { data: { publicUrl } } = supabase.storage
                    .from('stems')
                    .getPublicUrl(fileName);

                console.log('[StemPlayerWrapper] Public URL:', publicUrl);

                newStems.push({
                    label: file.name.replace(/\.[^/.]+$/, ""), // Remove extension
                    src: publicUrl,
                    volume: 1.0,
                    muted: false,
                    color: getRandomColor(),
                    storagePath: fileName // Store path for potential deletion later
                });
            }

            if (newStems.length > 0) {
                const updatedStems = [...stems, ...newStems];
                console.log('[StemPlayerWrapper] Setting stems:', updatedStems);
                setStems(updatedStems);

                // 3. Save metadata to DB
                if (textId) {
                    console.log('[StemPlayerWrapper] Saving to database...');
                    await updateText(textId, { stems: updatedStems });
                    console.log('[StemPlayerWrapper] Database update complete');

                    // 4. Refresh parent data to ensure sync
                    if (onStemsUpdate) {
                        console.log('[StemPlayerWrapper] Triggering parent data refresh...');
                        await onStemsUpdate();
                    }
                }
            }
        } catch (error) {
            console.error('[StemPlayerWrapper] Error processing uploads:', error);
            console.error('[StemPlayerWrapper] Error stack:', error.stack);
            alert('An error occurred while uploading files. Check console for details.');
        } finally {
            setIsUploading(false);
            // Reset file input
            event.target.value = '';
        }
    };

    const handleClearStems = async () => {
        if (window.confirm('Are you sure you want to remove all stems? This will delete the files permanently.')) {
            setIsUploading(true);
            try {
                // Delete files from storage
                const pathsToDelete = stems.map(s => s.storagePath).filter(Boolean);
                if (pathsToDelete.length > 0) {
                    const { error } = await supabase.storage
                        .from('stems')
                        .remove(pathsToDelete);

                    if (error) console.error('Error deleting files from storage:', error);
                }

                setStems([]);
                if (textId) {
                    await updateText(textId, { stems: [] });

                    // Refresh parent data to ensure sync
                    if (onStemsUpdate) {
                        await onStemsUpdate();
                    }
                }
            } catch (error) {
                console.error('Error clearing stems:', error);
            } finally {
                setIsUploading(false);
            }
        }
    };

    const getRandomColor = () => {
        const colors = ['#ef4444', '#f97316', '#f59e0b', '#84cc16', '#10b981', '#06b6d4', '#3b82f6', '#8b5cf6', '#d946ef', '#f43f5e'];
        return colors[Math.floor(Math.random() * colors.length)];
    };

    return (
        <div className={`flex flex-col h-full border-r w-full flex-shrink-0 transition-colors ${!isVisible ? 'hidden' : ''
            } ${isDarkMode ? 'bg-gray-900 text-white border-gray-800' : 'bg-gray-50 text-black border-gray-200'
            }`}>
            <div className={`p-4 border-b ${isDarkMode ? 'border-gray-800' : 'border-gray-200'}`}>
                <h2 className="text-sm font-bold uppercase tracking-wider mb-4">Backing Tracks</h2>

                {/* Storage Status Indicator - only show if stems exist and bucket isn't accessible */}
                {bucketStatus === 'error' && bucketError && stems.length === 0 && (
                    <div className={`mb-4 p-3 rounded-md text-xs ${isDarkMode ? 'bg-red-900/30 text-red-400 border border-red-800' : 'bg-red-50 text-red-700 border border-red-200'
                        }`}>
                        <div className="font-medium mb-1">⚠ Storage Not Configured</div>
                        <div className="opacity-90">{bucketError}</div>
                        <div className="mt-2 text-xs opacity-75">
                            Go to <a href="https://quxjesuarzbqqoahogma.supabase.co/project/_/storage/buckets" target="_blank" rel="noopener noreferrer" className="underline">Supabase Dashboard</a> and verify the "stems" bucket exists.
                        </div>
                        <div className="mt-2 text-xs opacity-75">
                            See <code className="font-mono bg-black/20 px-1 py-0.5 rounded">SUPABASE_SETUP.md</code> for setup instructions.
                        </div>
                    </div>
                )}

                <div className="mb-6">
                    <label className={`block text-xs uppercase tracking-wider mb-2 font-medium ${isDarkMode ? 'text-gray-400' : 'text-gray-500'
                        }`}>Add Stems</label>

                    <div className="relative">
                        <input
                            type="file"
                            multiple
                            accept="audio/*"
                            onChange={handleFileUpload}
                            disabled={isUploading}
                            className={`block w-full text-xs file:mr-3 file:py-2 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-medium file:uppercase file:tracking-wider cursor-pointer ${isDarkMode
                                ? 'text-gray-300 file:bg-gray-800 file:text-white hover:file:bg-gray-700'
                                : 'text-gray-600 file:bg-gray-200 file:text-black hover:file:bg-gray-300'
                                } ${isUploading ? 'opacity-50 cursor-not-allowed' : ''}`}
                        />
                        {isUploading && (
                            <div className="absolute right-0 top-0 bottom-0 flex items-center pr-2">
                                <div className="animate-spin h-4 w-4 border-2 border-blue-500 rounded-full border-t-transparent"></div>
                            </div>
                        )}
                    </div>

                    {stems.length > 0 && (
                        <button
                            onClick={handleClearStems}
                            disabled={isUploading}
                            className="mt-3 text-xs text-red-500 hover:text-red-600 underline block transition-colors"
                        >
                            Clear All Stems
                        </button>
                    )}
                </div>

            </div>

            <div className="flex-grow overflow-y-auto custom-scrollbar p-2">
                <stemplayer-js ref={attachPlayer} class="block w-full">
                    <stemplayer-js-controls
                        label="Master"
                        style={{
                            '--stemplayer-js-bg': 'transparent',
                            '--stemplayer-js-text': isDarkMode ? '#fff' : '#000',
                            '--stemplayer-js-secondary': isDarkMode ? '#4b5563' : '#d1d5db',
                        }}
                    ></stemplayer-js-controls>
                    {stems.map((stem, index) => (
                        <stemplayer-js-stem
                            key={index}
                            label={stem.label}
                            src={stem.src}
                            waveform={stem.src}
                            volume={stem.volume}
                            muted={stem.muted}
                            waveColor={stem.color}
                            waveProgressColor={isDarkMode ? '#60a5fa' : '#2563eb'}
                            style={{
                                '--stemplayer-js-stem-color': stem.color,
                                '--stemplayer-js-bg': 'transparent',
                                '--stemplayer-js-text': isDarkMode ? '#fff' : '#000',
                                '--stemplayer-js-waveform-color': stem.color,
                                '--stemplayer-js-waveform-progress-color': isDarkMode ? '#60a5fa' : '#2563eb',
                            }}
                        ></stemplayer-js-stem>
                    ))}
                </stemplayer-js>

                {stems.length === 0 && !isUploading && (
                    <div className={`p-8 text-center text-sm ${isDarkMode ? 'text-gray-600' : 'text-gray-400'
                        }`}>
                        <p>No backing tracks loaded.</p>
                        <p className="mt-1 text-xs opacity-75">Upload audio files to start.</p>
                    </div>
                )}
            </div>
            <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent; 
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: ${isDarkMode ? '#374151' : '#d1d5db'}; 
          border-radius: 3px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: ${isDarkMode ? '#4b5563' : '#9ca3af'}; 
        }
      `}</style>
        </div>
    );
};

export default StemPlayerWrapper;
