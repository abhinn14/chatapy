import React from 'react';
import {useState,useEffect} from 'react';
import {Routes,Route,Navigate} from 'react-router-dom';
import {Toaster} from 'react-hot-toast';

import Navbar from './comps/Navbar.jsx';
import HomePage from './comps/HomePage.jsx';
import SignupPage from './comps/SignupPage.jsx';
import LoginPage from './comps/LoginPage.jsx';
import {useStore} from './store/store.js';


function App() {

  const {authUser,checkAuth,isCheckingAuth,onlineUsers} = useStore();
  useEffect(() => {checkAuth()},[checkAuth]);

  if(isCheckingAuth && !checkAuth) {return (<img className='w-10 h-10' src={loaderGif}/>);}

  return (
    <div>
      
       <Navbar/>

       <Routes>

          <Route path="/" element={authUser ? <HomePage/> : <Navigate to='/login'/>} />
          <Route path="/signup" element={!authUser ? <SignupPage/> : <Navigate to='/'/>} />
          <Route path="/login" element={!authUser ? <LoginPage/> : <Navigate to='/'/>} />

       </Routes>

       <Toaster/>

    </div>
  )
}

export default App;