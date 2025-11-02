import React from 'react';

const NoChatSelected = () => {
  return (
    <div className="w-full flex flex-1 flex-col items-center justify-center p-16 bg-base-100/50">
      <div className="max-w-md text-center space-y-6">        
        <h2 className="text-2xl font-bold">Welcome to CHATAPY!</h2>
        <p className="text-base-content/60">
          For your privacy, your messages are encrypted and linked to the browser you use. 
          This means you can only access past chats on the browser in which they were created.<br/>
          {"(◔◡◔)"}
        </p>
      </div>
    </div>
  );
};

export default NoChatSelected;