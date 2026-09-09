import React, { useEffect, useMemo, useState } from 'react';
import {
  Badge,
  Box,
  Button,
  Card,
  Dialog,
  DropdownMenu,
  Flex,
  Grid,
  Heading,
  IconButton,
  Select,
  Separator,
  Text,
  TextField,
  Tooltip
} from '@radix-ui/themes';
import {
  getTexts,
  createText,
  updateText,
  deleteText,
  setTextTags,
  getTags,
  createTag,
  updateTag,
  deleteTag,
  getCachedTags,
  getCachedTexts
} from '../utils/storage';
import QuillEditor from './QuillEditor';

const SORT_STORAGE_KEY = 'songSort';
const SORTS = {
  recent: { label: 'Recently added', compare: (a, b) => b.createdAt - a.createdAt },
  name: { label: 'Name (A–Z)', compare: (a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }) }
};

const icons = {
  search: <path d="M21 21l-4.35-4.35M11 19a8 8 0 1 1 0-16 8 8 0 0 1 0 16z" />,
  plus: <path d="M12 5v14M5 12h14" />,
  more: <path d="M12 6h.01M12 12h.01M12 18h.01" />,
  sun: (
    <>
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </>
  ),
  moon: <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />,
  menu: (
    <>
      <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
    </>
  )
};

const Icon = ({ name, size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    {icons[name]}
  </svg>
);

const emptyDraft = {
  title: '',
  artist: '',
  youtubeUrl: '',
  ultimateGuitarUrl: '',
  soundsliceUrl: '',
  content: '',
  tagIds: []
};

export default function HomePage({ onPracticeText, selectedTagId = 'all', onSelectTag, isDarkMode, onToggleDarkMode }) {
  const [tags, setTags] = useState(() => getCachedTags() || []);
  const [songs, setSongs] = useState(() => getCachedTexts() || []);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState(() => localStorage.getItem(SORT_STORAGE_KEY) || 'recent');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const [draft, setDraft] = useState(emptyDraft);
  const [editingSong, setEditingSong] = useState(null);
  const [isSongDialogOpen, setIsSongDialogOpen] = useState(false);

  const [tagDialog, setTagDialog] = useState(null); // { mode: 'new' | 'edit', id, name }

  const loadData = async () => {
    const [tagsData, songsData] = await Promise.all([getTags(), getTexts()]);
    setTags(tagsData);
    setSongs(songsData);
  };

  // First load: state is set from the promise, not synchronously in the effect
  useEffect(() => {
    let cancelled = false;
    Promise.all([getTags(), getTexts()]).then(([tagsData, songsData]) => {
      if (cancelled) return;
      setTags(tagsData);
      setSongs(songsData);
    });
    return () => { cancelled = true; };
  }, []);

  const changeSort = (key) => {
    setSortKey(key);
    localStorage.setItem(SORT_STORAGE_KEY, key);
  };

  const tagsById = useMemo(
    () => Object.fromEntries(tags.map(tag => [tag.id, tag])),
    [tags]
  );

  const countFor = (tagId) => {
    if (tagId === 'all') return songs.length;
    if (tagId === 'untagged') return songs.filter(song => (song.tagIds || []).length === 0).length;
    return songs.filter(song => (song.tagIds || []).includes(tagId)).length;
  };

  // Search covers the title, the artist and the song's tag names
  const visibleSongs = useMemo(() => {
    const query = search.trim().toLowerCase();
    const matchesTag = (song) => {
      if (selectedTagId === 'all') return true;
      if (selectedTagId === 'untagged') return (song.tagIds || []).length === 0;
      return (song.tagIds || []).includes(selectedTagId);
    };
    const matchesQuery = (song) => {
      if (!query) return true;
      const tagNames = (song.tagIds || []).map(id => tagsById[id]?.name || '').join(' ');
      return `${song.title} ${song.artist || ''} ${tagNames}`.toLowerCase().includes(query);
    };

    return songs.filter(song => matchesTag(song) && matchesQuery(song)).sort(SORTS[sortKey].compare);
  }, [songs, search, selectedTagId, sortKey, tagsById]);

  // ---- Songs ----

  const openNewSong = () => {
    setEditingSong(null);
    setDraft({
      ...emptyDraft,
      tagIds: selectedTagId !== 'all' && selectedTagId !== 'untagged' ? [selectedTagId] : []
    });
    setIsSongDialogOpen(true);
  };

  const openEditSong = (song) => {
    setEditingSong(song);
    setDraft({
      title: song.title || '',
      artist: song.artist || '',
      youtubeUrl: song.youtubeUrl || '',
      ultimateGuitarUrl: song.ultimateGuitarUrl || '',
      soundsliceUrl: song.soundsliceUrl || '',
      content: song.content || '',
      tagIds: song.tagIds || []
    });
    setIsSongDialogOpen(true);
  };

  const saveSong = async () => {
    if (!draft.title.trim() || !draft.content.trim()) return;

    if (editingSong) {
      await updateText(editingSong.id, {
        title: draft.title.trim(),
        artist: draft.artist.trim(),
        youtubeUrl: draft.youtubeUrl.trim(),
        ultimateGuitarUrl: draft.ultimateGuitarUrl.trim(),
        soundsliceUrl: draft.soundsliceUrl.trim(),
        content: draft.content
      });
      await setTextTags(editingSong.id, draft.tagIds);
    } else {
      await createText({
        title: draft.title.trim(),
        content: draft.content,
        artist: draft.artist.trim(),
        youtubeUrl: draft.youtubeUrl.trim(),
        ultimateGuitarUrl: draft.ultimateGuitarUrl.trim(),
        soundsliceUrl: draft.soundsliceUrl.trim(),
        tagIds: draft.tagIds
      });
    }

    setIsSongDialogOpen(false);
    setEditingSong(null);
    setDraft(emptyDraft);
    await loadData();
  };

  const removeSong = async (song) => {
    if (!confirm(`Delete "${song.title}"?`)) return;
    await deleteText(song.id);
    await loadData();
  };

  const toggleDraftTag = (tagId) => {
    setDraft(current => ({
      ...current,
      tagIds: current.tagIds.includes(tagId)
        ? current.tagIds.filter(id => id !== tagId)
        : [...current.tagIds, tagId]
    }));
  };

  /** Tag a song straight from its card */
  const toggleSongTag = async (song, tagId) => {
    const current = song.tagIds || [];
    const next = current.includes(tagId) ? current.filter(id => id !== tagId) : [...current, tagId];
    setSongs(list => list.map(item => item.id === song.id ? { ...item, tagIds: next } : item));
    await setTextTags(song.id, next);
  };

  // ---- Tags ----

  const saveTag = async () => {
    const name = tagDialog?.name.trim();
    if (!name) return;
    if (tagDialog.mode === 'edit') await updateTag(tagDialog.id, name);
    else await createTag(name);
    setTagDialog(null);
    await loadData();
  };

  const removeTag = async (tag) => {
    if (!confirm(`Delete the tag "${tag.name}"? The songs themselves are kept.`)) return;
    await deleteTag(tag.id);
    if (selectedTagId === tag.id) onSelectTag('all');
    await loadData();
  };

  // ---- Rendering ----

  const filters = [
    { id: 'all', name: 'All songs' },
    ...tags,
    { id: 'untagged', name: 'Untagged' }
  ];

  const sidebar = (
    <Flex direction="column" gap="1" p="3">
      <Flex align="center" justify="between" px="2" pb="2">
        <Text size="1" weight="bold" color="gray" style={{ textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Tags
        </Text>
        <Tooltip content="New tag">
          <IconButton size="1" variant="soft" onClick={() => setTagDialog({ mode: 'new', name: '' })}>
            <Icon name="plus" size={14} />
          </IconButton>
        </Tooltip>
      </Flex>

      {filters.map(filter => {
        const isSelected = selectedTagId === filter.id;
        const isRealTag = filter.id !== 'all' && filter.id !== 'untagged';
        const count = countFor(filter.id);
        if (filter.id === 'untagged' && count === 0) return null;

        return (
          <Flex
            key={filter.id}
            align="center"
            justify="between"
            gap="1"
            px="2"
            py="1"
            style={{
              borderRadius: 'var(--radius-3)',
              cursor: 'pointer',
              background: isSelected ? 'var(--accent-a4)' : 'transparent'
            }}
            onClick={() => {
              onSelectTag(filter.id);
              setIsSidebarOpen(false);
            }}
          >
            <Text size="2" weight={isSelected ? 'bold' : 'regular'} truncate>
              {filter.name}
            </Text>
            <Flex align="center" gap="1">
              <Text size="1" color="gray" style={{ fontVariantNumeric: 'tabular-nums' }}>{count}</Text>
              {isRealTag && (
                <DropdownMenu.Root>
                  <DropdownMenu.Trigger onClick={(event) => event.stopPropagation()}>
                    <IconButton size="1" variant="ghost" color="gray" aria-label={`Edit ${filter.name}`}>
                      <Icon name="more" size={14} />
                    </IconButton>
                  </DropdownMenu.Trigger>
                  <DropdownMenu.Content size="1">
                    <DropdownMenu.Item onSelect={() => setTagDialog({ mode: 'edit', id: filter.id, name: filter.name })}>
                      Rename
                    </DropdownMenu.Item>
                    <DropdownMenu.Item color="red" onSelect={() => removeTag(filter)}>
                      Delete
                    </DropdownMenu.Item>
                  </DropdownMenu.Content>
                </DropdownMenu.Root>
              )}
            </Flex>
          </Flex>
        );
      })}
    </Flex>
  );

  return (
    <Box style={{ minHeight: '100vh', background: 'var(--gray-2)' }}>
      {/* Top bar */}
      <Box
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 20,
          background: 'var(--color-panel-solid)',
          borderBottom: '1px solid var(--gray-a5)'
        }}
      >
        <Flex align="center" gap="3" px={{ initial: '3', md: '5' }} py="3">
          <IconButton
            variant="ghost"
            color="gray"
            className="home-menu-button"
            onClick={() => setIsSidebarOpen(open => !open)}
            aria-label="Show tags"
          >
            <Icon name="menu" />
          </IconButton>

          <Heading size="4" style={{ letterSpacing: '-0.01em', whiteSpace: 'nowrap' }}>
            The Repetoire
          </Heading>

          <Box style={{ flex: 1, maxWidth: 420 }}>
            <TextField.Root
              size="2"
              placeholder="Search songs, artists and tags"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            >
              <TextField.Slot>
                <Icon name="search" size={15} />
              </TextField.Slot>
              {search && (
                <TextField.Slot>
                  <IconButton size="1" variant="ghost" color="gray" onClick={() => setSearch('')} aria-label="Clear search">
                    ✕
                  </IconButton>
                </TextField.Slot>
              )}
            </TextField.Root>
          </Box>

          <Box className="home-sort">
            <Select.Root value={sortKey} onValueChange={changeSort} size="2">
              <Select.Trigger variant="soft" color="gray" />
              <Select.Content>
                {Object.entries(SORTS).map(([key, sort]) => (
                  <Select.Item key={key} value={key}>{sort.label}</Select.Item>
                ))}
              </Select.Content>
            </Select.Root>
          </Box>

          <Tooltip content={isDarkMode ? 'Light mode' : 'Dark mode'}>
            <IconButton variant="soft" color="gray" onClick={onToggleDarkMode} aria-label="Toggle theme">
              <Icon name={isDarkMode ? 'sun' : 'moon'} />
            </IconButton>
          </Tooltip>

          <Button onClick={openNewSong}>
            <Icon name="plus" size={15} />
            <span className="home-new-label">New song</span>
          </Button>
        </Flex>
      </Box>

      <Flex align="start">
        {/* Dim the songs behind the drawer on a phone */}
        {isSidebarOpen && (
          <Box
            onClick={() => setIsSidebarOpen(false)}
            className="home-scrim"
            style={{ position: 'fixed', inset: '61px 0 0 0', background: 'var(--black-a6)', zIndex: 18 }}
          />
        )}

        {/* Tag sidebar */}
        <Box
          className={`home-sidebar${isSidebarOpen ? ' is-open' : ''}`}
          style={{
            width: 232,
            flexShrink: 0,
            borderRight: '1px solid var(--gray-a5)',
            background: 'var(--color-panel-solid)',
            minHeight: 'calc(100vh - 61px)'
          }}
        >
          {sidebar}
        </Box>

        {/* Songs */}
        <Box p={{ initial: '3', md: '5' }} style={{ flex: 1, minWidth: 0 }}>
          <Flex align="center" justify="between" mb="4" gap="3" wrap="wrap">
            <Heading size="3" color="gray" weight="medium">
              {selectedTagId === 'all'
                ? 'All songs'
                : selectedTagId === 'untagged'
                  ? 'Untagged'
                  : tagsById[selectedTagId]?.name || 'Songs'}
              <Text size="2" color="gray" ml="2">
                {visibleSongs.length}
              </Text>
            </Heading>
          </Flex>

          {visibleSongs.length === 0 ? (
            <Flex direction="column" align="center" gap="2" py="9">
              <Text size="3" color="gray">
                {search ? `Nothing matches “${search}”` : 'No songs here yet'}
              </Text>
              {!search && (
                <Button variant="soft" onClick={openNewSong}>Add your first song</Button>
              )}
            </Flex>
          ) : (
            <Grid columns={{ initial: '1', xs: '2', md: '3', xl: '4' }} gap="3">
              {visibleSongs.map(song => (
                <Card key={song.id} size="2" style={{ display: 'flex', flexDirection: 'column' }}>
                  <Flex direction="column" gap="2" style={{ height: '100%' }}>
                    <Flex justify="between" align="start" gap="2">
                      <Box style={{ minWidth: 0 }}>
                        <Text as="div" size="3" weight="bold" truncate>{song.title}</Text>
                        {song.artist && (
                          <Text as="div" size="2" color="gray" truncate>{song.artist}</Text>
                        )}
                      </Box>

                      <DropdownMenu.Root>
                        <DropdownMenu.Trigger>
                          <IconButton size="1" variant="ghost" color="gray" aria-label={`Options for ${song.title}`}>
                            <Icon name="more" size={16} />
                          </IconButton>
                        </DropdownMenu.Trigger>
                        <DropdownMenu.Content size="1">
                          <DropdownMenu.Item onSelect={() => openEditSong(song)}>Edit</DropdownMenu.Item>
                          {tags.length > 0 && (
                            <DropdownMenu.Sub>
                              <DropdownMenu.SubTrigger>Tags</DropdownMenu.SubTrigger>
                              <DropdownMenu.SubContent>
                                {tags.map(tag => (
                                  <DropdownMenu.CheckboxItem
                                    key={tag.id}
                                    checked={(song.tagIds || []).includes(tag.id)}
                                    onSelect={(event) => {
                                      event.preventDefault();
                                      toggleSongTag(song, tag.id);
                                    }}
                                  >
                                    {tag.name}
                                  </DropdownMenu.CheckboxItem>
                                ))}
                              </DropdownMenu.SubContent>
                            </DropdownMenu.Sub>
                          )}
                          <DropdownMenu.Separator />
                          <DropdownMenu.Item color="red" onSelect={() => removeSong(song)}>Delete</DropdownMenu.Item>
                        </DropdownMenu.Content>
                      </DropdownMenu.Root>
                    </Flex>

                    {(song.tagIds || []).length > 0 && (
                      <Flex gap="1" wrap="wrap">
                        {(song.tagIds || []).map(tagId => tagsById[tagId] && (
                          <Badge
                            key={tagId}
                            variant="soft"
                            color="gray"
                            radius="full"
                            style={{ cursor: 'pointer' }}
                            onClick={() => onSelectTag(tagId)}
                          >
                            {tagsById[tagId].name}
                          </Badge>
                        ))}
                      </Flex>
                    )}

                    <Box style={{ flex: 1 }} />

                    {(song.ultimateGuitarUrl || song.soundsliceUrl) && (
                      <Flex gap="2">
                        {song.ultimateGuitarUrl && (
                          <Button size="1" variant="soft" color="gray" asChild>
                            <a href={song.ultimateGuitarUrl} target="_blank" rel="noopener noreferrer">Ultimate Guitar</a>
                          </Button>
                        )}
                        {song.soundsliceUrl && (
                          <Button size="1" variant="soft" color="gray" asChild>
                            <a href={song.soundsliceUrl} target="_blank" rel="noopener noreferrer">Soundslice</a>
                          </Button>
                        )}
                      </Flex>
                    )}

                    <Button onClick={() => onPracticeText(song)}>Practice</Button>
                  </Flex>
                </Card>
              ))}
            </Grid>
          )}
        </Box>
      </Flex>

      {/* Song dialog */}
      <Dialog.Root
        open={isSongDialogOpen}
        onOpenChange={(open) => {
          setIsSongDialogOpen(open);
          if (!open) { setEditingSong(null); setDraft(emptyDraft); }
        }}
      >
        <Dialog.Content maxWidth="640px">
          <Dialog.Title>{editingSong ? 'Edit song' : 'New song'}</Dialog.Title>
          <Flex direction="column" gap="3" mt="4">
            <TextField.Root
              size="3"
              placeholder="Title"
              value={draft.title}
              onChange={(event) => setDraft({ ...draft, title: event.target.value })}
              autoFocus
            />
            <TextField.Root
              size="3"
              placeholder="Artist (optional)"
              value={draft.artist}
              onChange={(event) => setDraft({ ...draft, artist: event.target.value })}
            />
            <TextField.Root
              size="3"
              placeholder="YouTube URL (optional)"
              value={draft.youtubeUrl}
              onChange={(event) => setDraft({ ...draft, youtubeUrl: event.target.value })}
            />
            <Grid columns={{ initial: '1', sm: '2' }} gap="3">
              <TextField.Root
                size="3"
                placeholder="Ultimate Guitar URL"
                value={draft.ultimateGuitarUrl}
                onChange={(event) => setDraft({ ...draft, ultimateGuitarUrl: event.target.value })}
              />
              <TextField.Root
                size="3"
                placeholder="Soundslice URL"
                value={draft.soundsliceUrl}
                onChange={(event) => setDraft({ ...draft, soundsliceUrl: event.target.value })}
              />
            </Grid>

            <QuillEditor
              value={draft.content}
              onChange={(value) => setDraft(current => ({ ...current, content: value }))}
              placeholder="Paste the lyrics and chords here…"
              isDarkMode={isDarkMode}
            />

            <Box>
              <Text as="div" size="1" weight="bold" color="gray" mb="2" style={{ textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Tags
              </Text>
              <Flex gap="2" wrap="wrap">
                {tags.map(tag => {
                  const isOn = draft.tagIds.includes(tag.id);
                  return (
                    <Badge
                      key={tag.id}
                      variant={isOn ? 'solid' : 'soft'}
                      color={isOn ? undefined : 'gray'}
                      radius="full"
                      size="2"
                      style={{ cursor: 'pointer' }}
                      onClick={() => toggleDraftTag(tag.id)}
                    >
                      {tag.name}
                    </Badge>
                  );
                })}
                <Badge
                  variant="outline"
                  color="gray"
                  radius="full"
                  size="2"
                  style={{ cursor: 'pointer' }}
                  onClick={() => setTagDialog({ mode: 'new', name: '' })}
                >
                  + New tag
                </Badge>
              </Flex>
            </Box>

            <Separator size="4" />

            <Flex gap="3" justify="end">
              <Dialog.Close>
                <Button variant="soft" color="gray">Cancel</Button>
              </Dialog.Close>
              <Button onClick={saveSong} disabled={!draft.title.trim() || !draft.content.trim()}>
                {editingSong ? 'Save' : 'Create'}
              </Button>
            </Flex>
          </Flex>
        </Dialog.Content>
      </Dialog.Root>

      {/* Tag dialog */}
      <Dialog.Root open={!!tagDialog} onOpenChange={(open) => { if (!open) setTagDialog(null); }}>
        <Dialog.Content maxWidth="400px">
          <Dialog.Title>{tagDialog?.mode === 'edit' ? 'Rename tag' : 'New tag'}</Dialog.Title>
          <Flex direction="column" gap="4" mt="4">
            <TextField.Root
              size="3"
              placeholder="Tag name"
              value={tagDialog?.name || ''}
              onChange={(event) => setTagDialog(current => ({ ...current, name: event.target.value }))}
              onKeyDown={(event) => { if (event.key === 'Enter') saveTag(); }}
              autoFocus
            />
            <Flex gap="3" justify="end">
              <Dialog.Close>
                <Button variant="soft" color="gray">Cancel</Button>
              </Dialog.Close>
              <Button onClick={saveTag} disabled={!tagDialog?.name.trim()}>
                {tagDialog?.mode === 'edit' ? 'Save' : 'Create'}
              </Button>
            </Flex>
          </Flex>
        </Dialog.Content>
      </Dialog.Root>

      <style>{`
        /* The sidebar is a drawer on a phone and a column from md up */
        .home-sidebar {
          position: fixed;
          top: 61px;
          bottom: 0;
          left: 0;
          z-index: 19;
          transform: translateX(-100%);
          transition: transform 0.2s ease;
        }
        .home-sidebar.is-open { transform: translateX(0); }
        @media (min-width: 768px) {
          .home-sidebar { position: sticky; top: 61px; transform: none; }
          .home-menu-button { display: none !important; }
          .home-scrim { display: none !important; }
        }
        @media (max-width: 640px) {
          .home-sort { display: none; }
          .home-new-label { display: none; }
        }
      `}</style>
    </Box>
  );
}
