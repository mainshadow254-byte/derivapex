(function(){
  if(!window.ChartTerminal)return;
  const connect=ChartTerminal.prototype._connectLive;
  const destroy=ChartTerminal.prototype.destroy;
  ChartTerminal.prototype._connectLive=function(){
    this._apexConnectionVersion=(this._apexConnectionVersion||0)+1;
    const version=this._apexConnectionVersion;
    if(this.ws)this.ws.onclose=null;
    connect.call(this);
    const socket=this.ws;
    if(!socket)return;
    socket.onclose=()=>{
      if(this._apexDestroyed||version!==this._apexConnectionVersion)return;
      setTimeout(()=>{
        if(!this._apexDestroyed&&version===this._apexConnectionVersion)this._connectLive();
      },4000);
    };
  };
  ChartTerminal.prototype.destroy=function(){
    this._apexDestroyed=true;
    this._apexConnectionVersion=(this._apexConnectionVersion||0)+1;
    if(this.ws)this.ws.onclose=null;
    destroy.call(this);
  };
})();