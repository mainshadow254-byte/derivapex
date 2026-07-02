(function(){
  if(!window.Blockly?.inject)return;
  const inject=window.Blockly.inject.bind(window.Blockly);
  window.Blockly.inject=function(){
    const workspace=inject(...arguments);
    window.ApexBuilderWorkspace=workspace;
    window.dispatchEvent(new CustomEvent('apex:builder-workspace-ready',{detail:{workspace}}));
    return workspace;
  };
})();
