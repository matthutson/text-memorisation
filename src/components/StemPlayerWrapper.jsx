import React, { useEffect, useState } from 'react';
import { Badge, Box, Button, Flex, IconButton, Progress, Slider, Text } from '@radix-ui/themes';
import { supabase } from '../utils/supabase';
import { updateText } from '../utils/storage';
import { getMinutesLeft, splitIntoStems } from '../utils/stemSplit';

const StemPlayerWrapper = ({ stems = [], setStems, textId, onStemsUpdate, isVisible = true, engine }) => {
    const [isUploading, setIsUploading] = useState(false);
    const [bucketStatus, setBucketStatus] = useState('checking'); // 'checking', 'ready', 'error'
    const [bucketError, setBucketError] = useState(null);
    const [splitProgress, setSplitProgress] = useState(null); // { percent, message }
    const [splitError, setSplitError] = useState(null);
    const [minutesLeft, setMinutesLeft] = useState(null); // null until the API answers, and when it isn't configured
    const [levels, setLevels] = useState({}); // src -> { volume, muted }

    const levelFor = (stem) => levels[stem.src] || { volume: stem.volume ?? 1, muted: !!stem.muted };

    const setLevel = (index, stem, next) => {
        setLevels(current => ({ ...current, [stem.src]: next }));
        if (!engine) return;
        engine.setStemVolume(index, next.volume);
        engine.setStemMuted(index, next.muted);
    };

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
        getMinutesLeft().then(setMinutesLeft);
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

    // Send a full song to LALAL.AI and keep the vocal and backing stems
    const handleSplitUpload = async (event) => {
        const file = event.target.files[0];
        event.target.value = '';
        if (!file) return;

        if (!textId) {
            alert('Save this song before splitting a track for it.');
            return;
        }

        setSplitError(null);
        setSplitProgress({ percent: 0, message: 'Starting…' });

        try {
            const newStems = await splitIntoStems(file, {
                textId,
                onProgress: ({ percent, message }) => setSplitProgress({ percent, message })
            });

            const updatedStems = [...stems, ...newStems];
            setStems(updatedStems);
            await updateText(textId, { stems: updatedStems });
            if (onStemsUpdate) await onStemsUpdate();
            getMinutesLeft().then(setMinutesLeft);
        } catch (error) {
            console.error('[StemPlayerWrapper] Split failed:', error);
            setSplitError(error.message);
        } finally {
            setSplitProgress(null);
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
        <Box
            style={{
                display: isVisible ? 'block' : 'none',
                flexShrink: 0,
                borderTop: '1px solid var(--gray-a5)',
                background: 'var(--color-panel-solid)',
                maxHeight: '45vh',
                overflowY: 'auto'
            }}
        >
            <Flex direction={{ initial: 'column', md: 'row' }} gap="5" p="4" align="start">
                {/* Add existing stems */}
                <Flex direction="column" gap="2" style={{ minWidth: 200 }}>
                    <Text size="1" weight="bold" color="gray" style={{ textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                        Add tracks
                    </Text>
                    <Text size="1" color="gray">Audio files you already have.</Text>
                    <Flex gap="2" align="center">
                        <Button size="2" variant="soft" disabled={isUploading} asChild>
                            <label style={{ cursor: 'pointer' }}>
                                {isUploading ? 'Uploading…' : 'Choose files'}
                                <input
                                    type="file"
                                    multiple
                                    accept="audio/*"
                                    onChange={handleFileUpload}
                                    disabled={isUploading}
                                    style={{ display: 'none' }}
                                />
                            </label>
                        </Button>
                        {stems.length > 0 && (
                            <Button size="2" variant="ghost" color="red" onClick={handleClearStems} disabled={isUploading}>
                                Remove all
                            </Button>
                        )}
                    </Flex>
                </Flex>

                {/* Split a song into stems */}
                <Flex direction="column" gap="2" style={{ minWidth: 240 }}>
                    <Flex align="center" gap="2">
                        <Text size="1" weight="bold" color="gray" style={{ textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                            Split a song
                        </Text>
                        <Badge color={minutesLeft === null ? 'gray' : 'blue'} variant="soft" radius="full">
                            {minutesLeft === null ? 'Not set up' : `${Math.round(minutesLeft)} min left`}
                        </Badge>
                    </Flex>
                    <Text size="1" color="gray">Separates the vocal from the backing.</Text>
                    <Button size="2" variant="soft" disabled={!!splitProgress || isUploading} asChild>
                        <label style={{ cursor: 'pointer' }}>
                            {splitProgress ? 'Splitting…' : 'Choose a song'}
                            <input
                                type="file"
                                accept="audio/*"
                                onChange={handleSplitUpload}
                                disabled={!!splitProgress || isUploading}
                                style={{ display: 'none' }}
                            />
                        </label>
                    </Button>

                    {splitProgress && (
                        <Box>
                            <Progress value={splitProgress.percent} size="1" />
                            <Text as="div" size="1" color="gray" mt="1">{splitProgress.message}</Text>
                        </Box>
                    )}
                    {splitError && (
                        <Text as="div" size="1" color="red">{splitError}</Text>
                    )}
                    {bucketStatus === 'error' && bucketError && stems.length === 0 && (
                        <Text as="div" size="1" color="red">{bucketError}</Text>
                    )}
                </Flex>

                {/* Mixer */}
                <Box style={{ flex: 1, minWidth: 240, width: '100%' }}>
                    <Text as="div" size="1" weight="bold" color="gray" mb="2" style={{ textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                        Mix
                    </Text>

                    {stems.length === 0 && !isUploading && (
                        <Text as="div" size="1" color="gray">
                            No tracks yet. Add an audio file or split a song into stems.
                        </Text>
                    )}

                    <Flex direction="column" gap="2">
                        {stems.map((stem, index) => {
                            const level = levelFor(stem);
                            return (
                                <Flex key={stem.src} align="center" gap="3">
                                    <IconButton
                                        size="1"
                                        variant={level.muted ? 'solid' : 'soft'}
                                        color={level.muted ? 'red' : 'gray'}
                                        onClick={() => setLevel(index, stem, { ...level, muted: !level.muted })}
                                        title={level.muted ? 'Unmute' : 'Mute'}
                                    >
                                        {level.muted ? 'M' : '♪'}
                                    </IconButton>
                                    <Text size="2" style={{ width: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {stem.label}
                                    </Text>
                                    <Box style={{ flex: 1, maxWidth: 220 }}>
                                        <Slider
                                            size="1"
                                            value={[Math.round(level.volume * 100)]}
                                            onValueChange={([value]) => setLevel(index, stem, { ...level, volume: value / 100 })}
                                            min={0}
                                            max={100}
                                        />
                                    </Box>
                                </Flex>
                            );
                        })}
                    </Flex>
                </Box>
            </Flex>
        </Box>
    );
};

export default StemPlayerWrapper;
