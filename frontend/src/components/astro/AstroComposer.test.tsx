import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { AstroComposer } from './AstroComposer';
function Composer({send}:{send:(text:string)=>void}){const[draft,setDraft]=useState('');return <AstroComposer draft={draft} onDraft={setDraft} onSend={()=>send(draft)} suggestion="Help me choose a Mars site." pending={false}/>;}
describe('Astro placeholder',()=>{
 it('stays empty on focus and never inserts or submits the suggestion',()=>{
 const send=vi.fn();render(<Composer send={send}/>);const input=screen.getByRole('textbox',{name:'Message Astro'});
 expect(input).toHaveAttribute('placeholder','Help me choose a Mars site.');fireEvent.focus(input);fireEvent.click(input);fireEvent.keyDown(input,{key:'Tab'});expect(input).toHaveValue('');expect(send).not.toHaveBeenCalled();expect(screen.getByRole('button',{name:'Send message'})).toBeDisabled();
 fireEvent.change(input,{target:{value:'Compare terrain.'}});fireEvent.click(screen.getByRole('button',{name:'Send message'}));expect(send).toHaveBeenCalledWith('Compare terrain.');
 });
});
