import React from 'react';
import {Link} from 'react-router-dom';
import {LogOut} from 'lucide-react';

import {useStore} from '../store/store.js';

export default function Navbar() {

  const {logout,authUser} = useStore();

  return (
    <header className="border-b-4 border-black fixed w-full top-0 z-40 
    backdrop-blur-lg bg-base-100/80 bg-slate-850">
      <div className="container mx-auto px-4 h-16">
        <div className="flex items-center justify-between h-full">
          <div className="flex items-center gap-8">
            <Link to="/" className="flex items-center gap-2.5 hover:opacity-80 transition-all">
              <h1 className="text-3xl font-bold">CHATAPY</h1>
            </Link>
          </div>

          <div className="flex items-center gap-2">

            {authUser && (
              <>
                <button className="flex gap-2 items-center" onClick={logout}>
                  <LogOut className="size-5" />
                  <span className="hidden sm:inline">Logout</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}
