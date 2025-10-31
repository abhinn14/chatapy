import { useEffect, useMemo, useState } from "react";
import { useChatStore } from "../store/useChatStore.js";
import { useStore } from "../store/store.js";
import { Users, Search } from "lucide-react";
import SidebarSkeleton from "../skeletons/SidebarSkeleton.jsx";
import useDebounce from "../library/useDebounce.js";
import { CompressedTrie } from "../library/compressedTrie.js";

const Sidebar = () => {
  const { getUsers, users, selectedUser, setSelectedUser, isUsersLoading } =
    useChatStore();

  const { onlineUsers } = useStore();
  const [showOnlineOnly, setShowOnlineOnly] = useState(false);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);

  // ✅ Build the Trie once when users change
  const trie = useMemo(() => {
    const t = new CompressedTrie();
    users.forEach((u) => t.insert(u));
    return t;
  }, [users]);

  // ✅ Filter based on search prefix + online toggle
  const filteredUsers = useMemo(() => {
    let list = users;

    // Prefix search via Trie
    if (debouncedSearch.trim()) {
      list = trie.searchPrefix(debouncedSearch);
    }

    // Online-only filter
    if (showOnlineOnly) {
      list = list.filter((user) => onlineUsers.includes(user._id));
    }

    return list;
  }, [debouncedSearch, trie, showOnlineOnly, onlineUsers, users]);

  useEffect(() => {
    getUsers();
  }, [getUsers]);

  if (isUsersLoading) return <SidebarSkeleton />;

  return (
    <aside className="h-full w-20 lg:w-72 border-r border-base-300 flex flex-col transition-all duration-200">
      {/* Header */}
      <div className="border-b border-base-300 w-full p-5">
        <div className="flex items-center gap-2">
          <Users className="size-6" />
          <span className="font-medium hidden lg:block text-white">Contacts</span>
        </div>

        {/* ✅ Search bar */}
        <div className="relative mt-3 hidden lg:block">
          <Search className="absolute left-2 top-2.5 text-zinc-400 size-4" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search users..."
            className="pl-8 pr-3 py-2 w-full rounded-md bg-slate-700 text-white text-sm outline-none placeholder:text-zinc-400"
          />
        </div>

        {/* Online only toggle */}
        <div className="mt-3 hidden lg:flex items-center gap-2">
          <label className="cursor-pointer flex items-center gap-2">
            <input
              type="checkbox"
              checked={showOnlineOnly}
              onChange={(e) => setShowOnlineOnly(e.target.checked)}
              className="checkbox checkbox-sm"
            />
            <span className="text-sm">Show online only</span>
          </label>
          <span className="text-xs text-zinc-500">
            ({onlineUsers.length - 1} online)
          </span>
        </div>
      </div>

      {/* User list */}
      <div className="overflow-y-auto w-full py-3">
        {filteredUsers.map((user) => (
          <button
            key={user._id}
            onClick={() => setSelectedUser(user)}
            className={`w-full p-3 flex items-center gap-3 hover:bg-base-300 transition-colors ${
              selectedUser?._id === user._id
                ? "bg-base-300 ring-1 ring-base-300"
                : ""
            }`}
          >
            <div className="relative mx-auto lg:mx-0">
              <img
                src={
                  user.profilePic ||
                  "https://cdn-icons-png.flaticon.com/512/149/149071.png"
                }
                alt={user.name}
                className="size-12 object-cover rounded-full border border-slate-700 shadow-sm"
              />
              {onlineUsers.includes(user._id) && (
                <span className="absolute bottom-0 right-0 size-3 bg-green-500 rounded-full ring-2 ring-zinc-900" />
              )}
            </div>

            <div className="hidden lg:block text-left min-w-0">
              <div className="font-medium truncate text-white">{user.name}</div>
              <div className="text-sm text-zinc-400">
                {onlineUsers.includes(user._id) ? "Online" : "Offline"}
              </div>
            </div>
          </button>
        ))}

        {filteredUsers.length === 0 && (
          <div className="text-center text-zinc-500 py-4">
            No users found
          </div>
        )}
      </div>
    </aside>
  );
};

export default Sidebar;
