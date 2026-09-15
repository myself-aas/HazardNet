import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { useAuth } from '../../../context/AuthContext'
import RequireSuperAdmin from '../RequireSuperAdmin'
import RichTextEditor from '../RichTextEditor'

jest.mock('../../../context/AuthContext', () => ({
  useAuth: jest.fn(),
}))
jest.mock('../../../services/firebase', () => ({
  db: {},
}))

const setAuth = (state: { user: unknown; loading: boolean }) => {
  ;(useAuth as unknown as jest.Mock).mockReturnValue(state)
}

describe('RequireSuperAdmin — full-page route guard', () => {
  it('shows a permission check while auth is loading', () => {
    setAuth({ user: null, loading: true })
    render(
      <MemoryRouter>
        <RequireSuperAdmin>
          <div data-testid="studio" />
        </RequireSuperAdmin>
      </MemoryRouter>,
    )
    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.queryByTestId('studio')).not.toBeInTheDocument()
  })

  it('redirects signed-out users to a full-page sign-in prompt', () => {
    setAuth({ user: null, loading: false })
    render(
      <MemoryRouter initialEntries={['/dashboard/blog/new']}>
        <RequireSuperAdmin>
          <div data-testid="studio" />
        </RequireSuperAdmin>
      </MemoryRouter>,
    )
    expect(screen.getByRole('link', { name: /go to sign in/i })).toHaveAttribute(
      'href',
      '/login?next=%2Fdashboard%2Fblog%2Fnew',
    )
    expect(screen.queryByTestId('studio')).not.toBeInTheDocument()
  })

  it('permits registered users to access the studio', () => {
    setAuth({ user: { email: 'reader@example.com' }, loading: false })
    render(
      <MemoryRouter>
        <RequireSuperAdmin>
          <div data-testid="studio" />
        </RequireSuperAdmin>
      </MemoryRouter>,
    )
    expect(screen.getByTestId('studio')).toBeInTheDocument()
  })

  it('renders the studio for primary superadmins', () => {
    setAuth({ user: { email: 'shuvo.1807016@bau.edu.bd' }, loading: false })
    render(
      <MemoryRouter>
        <RequireSuperAdmin>
          <div data-testid="studio" />
        </RequireSuperAdmin>
      </MemoryRouter>,
    )
    expect(screen.getByTestId('studio')).toBeInTheDocument()
  })
})

describe('RichTextEditor — toolbar and editing surface', () => {
  it('renders the full formatting toolbar with word count', () => {
    render(<RichTextEditor value="<p>hello world from the field</p>" onChange={jest.fn()} />)
    const toolbar = screen.getByRole('toolbar', { name: /formatting toolbar/i })
    expect(toolbar).toBeInTheDocument()
    expect(screen.getByLabelText(/bold/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/italic/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/bulleted list/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/numbered list/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/insert link/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/insert image/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/block format/i)).toBeInTheDocument()
    expect(screen.getByText(/5 words/i)).toBeInTheDocument()
  })

  it('renders the article body into the editable surface', () => {
    render(<RichTextEditor value="<p>existing body</p>" onChange={jest.fn()} />)
    expect(screen.getByRole('textbox', { name: /article body/i }).innerHTML).toContain('existing body')
  })

  it('emits changes while typing', () => {
    const onChange = jest.fn()
    render(<RichTextEditor value="" onChange={onChange} />)
    const surface = screen.getByRole('textbox', { name: /article body/i })
    surface.innerHTML = '<p>typed</p>'
     
    ;(surface as HTMLElement).dispatchEvent(new Event('input', { bubbles: true }))
    expect(onChange).toHaveBeenCalledWith('<p>typed</p>')
  })

  it('toggles to HTML source view with the raw markup', () => {
    render(<RichTextEditor value="<p>raw markup</p>" onChange={jest.fn()} />)
    expect(screen.queryByLabelText(/html source/i)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /html/i }))
    expect((screen.getByLabelText(/html source/i) as HTMLTextAreaElement).value).toBe('<p>raw markup</p>')
  })
})
