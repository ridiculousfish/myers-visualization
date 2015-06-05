var TAG_DOWN = 1 << 0
var TAG_TOP = 1 << 1
var TAG_DELETED = 1 << 2
var TAG_RECENT = 1 << 3

/* An object produced by myers visualization algorithms, representing a step in the algorithm */
function visualization_result(tagged_string, highlight_lines, diagonal, candidate_lines, wants_delay, myers) {
    var self = this
    self.tagged_string = tagged_string
    self.highlight_lines = highlight_lines
    self.candidate_lines = candidate_lines
    self.wants_delay = wants_delay

    if (isNaN(diagonal)) {
        self.diagonal = []
    } else {
        // Diagonals are of the form x - y
        // Compute start and end points for it
        var startX = 0, startY = 0
        if (diagonal < 0) {
            startY = -diagonal
        } else {
            startX = diagonal
        }
    
        // Compute the endpoint of the diagonal
        // Ensure that its length is at least 1, even if it goes off the grid
        // Hacktastic
        var endX = startX, endY = startY
        do {
            endX++;
            endY++;
        } while (endX + 1 < myers.cols && endY + 1 < myers.rows);

        self.diagonal = [startX, startY, endX, endY]
    }
    return self
}

function myers_algorithms(){
    var self = this

    function tagged_char(idx, char, tag) {
        var self = this
        self.idx = idx
        self.char = char
        self.tag = tag

        self.retag = function(new_tag) {
            return new tagged_char(self.idx, self.char, new_tag)
        }

        return self
    }

    function tagged_string(str, tag) {
        var result = new Array()
        for (var i=0; i < str.length; i++) {
            result.push(new tagged_char(i, str[i], tag))
        }
        return result
    }

    function untag_string(arr) {
        var str = ''
        for (var i=0; i < arr.length; i++) {
            str += arr[i].char
        }
        return str
    }

    function index_of_tagged_char(arr, idx, tag) {
        for (var i=0; i < arr.length; i++) {
            var tc = arr[i]
            if ((tc.tag & tag) && tc.idx == idx) {
                return i
            }
        }
        return -1
    }

    function remove_tag(arr, tag) {
        for (var i=0; i < arr.length; i++) {
            if (arr[i].tag & tag) {
                arr[i] = arr[i].retag(arr[i].tag & ~tag)
            }
        }
    }

    // Single directional myers diff algorithm
    function step_myers_unidir(myers, visualizations) {
        var endpoints = new Array()
        endpoints[1] = 0

        var down_tagged_string = tagged_string(myers.down_string, TAG_DOWN)
        var top_tagged_string = tagged_string(myers.top_string, TAG_TOP)

        var intermediate_strings = new Array()
        intermediate_strings[1] = down_tagged_string

        var top_len = myers.top_string.length
        var down_len = myers.down_string.length
        var MAX = top_len + down_len
        var done = false
        for (var step=0; step <= MAX && ! done; step++) {
            for (var diagonal = -step; diagonal <= step; diagonal+=2) {

                function get_line(x, down) {
                    // if down is true, we are starting from the diagonal above us, which is larger
                    // if down is false, we are starting from the diagonal to our left, which is smaller
                    var other_diagonal = diagonal + (down ? 1 : -1)
                    var start_x = x - (down ? 0 : 1)
                    var start_y = start_x - other_diagonal
                    return [start_x, start_y, start_x + (down ? 0 : 1), start_y + (down ? 1 : 0)]
                }

                // Whether we traverse down (y+1) or right (x+1)
                var go_down

                var candidate_lines = []
                if (diagonal == -step) {
                    var top_x = endpoints[diagonal+1]
                    go_down = true
                    candidate_lines.push(get_line(top_x, go_down))
                } else if (diagonal == step) {
                    var left_x = endpoints[diagonal-1]
                    go_down = false
                    candidate_lines.push(get_line(left_x + 1, go_down))
                } else {
                    var left_x = endpoints[diagonal-1], top_x = endpoints[diagonal+1]
                    go_down = left_x < top_x
                    candidate_lines.push(get_line(top_x, true), get_line(left_x + 1, false))
                }

                var x
                if (go_down) {
                    // go down
                    x = endpoints[diagonal + 1]
                } else {
                    // go right
                    x = endpoints[diagonal - 1] + 1
                }
                var y = x - diagonal

                // Skip cases that go off the grid
                // Note we check >, not >=, because we have a terminating dots at x == top_len / y == down_len
                if (x > top_len || y > down_len) {
                    endpoints[diagonal] = x
                    continue
                }

                // update our tagged string
                var new_tagged_string
                if (go_down) {
                    new_tagged_string = intermediate_strings[diagonal + 1]
                } else {
                    new_tagged_string = intermediate_strings[diagonal - 1]
                }
                // Copy and remove all RECENT annotations
                new_tagged_string = new_tagged_string.slice(0)
                remove_tag(new_tagged_string, TAG_RECENT)

                if (step > 0) {
                    if (go_down) {
                        // We just traversed from y-1 to y. Strike through the character corresponding to that edge (y-1)
                        if (y <= down_len) {
                            var idx = index_of_tagged_char(new_tagged_string, y-1, TAG_DOWN)
                            new_tagged_string[idx] = new_tagged_string[idx].retag(TAG_DOWN | TAG_DELETED | TAG_RECENT)
                        }
                    } else {
                        // We just traversed from x-1 to x. Insert the character corresponding to that edge (x-1)
                        // Where do we insert it? It can go after the last element that's tagged with TOP or DELETED
                        if (x <= top_len) {
                            var new_element = top_tagged_string[x-1]
                            var last_top_tag_idx = new_tagged_string.length
                            while (last_top_tag_idx--) {
                                if (new_tagged_string[last_top_tag_idx].tag & (TAG_TOP | TAG_DELETED)) {
                                    break;
                                }
                            }
                            // last_top_tag_idx is now the index of the last top tagged element, or -1
                            // insert after it
                            new_tagged_string.splice(last_top_tag_idx + 1, 0, new_element.retag(new_element.tag | TAG_RECENT))
                        }
                    }
                }

                var highlight_lines = []

                if (visualizations) {
                    highlight_lines.push([x - (go_down ? 0 : 1), y - (go_down ? 1 : 0), x, y]) 
                    visualizations.push(new visualization_result(new_tagged_string, highlight_lines, diagonal, candidate_lines, true, myers))
                }

                // Traverse the snake
                while (x < top_len && y < down_len && myers.top_string[x] == myers.down_string[y]) {
                    x++
                    y++
                    if (visualizations) {
                        // copy and update our tagged string
                        // the character at index y-1 in our string is now shared
                        new_tagged_string = new_tagged_string.slice(0)
                        remove_tag(new_tagged_string, TAG_RECENT)
                        var idx = new_tagged_string.indexOf(down_tagged_string[y-1])
                        new_tagged_string[idx] = new_tagged_string[idx].retag(TAG_DOWN | TAG_TOP | TAG_RECENT)

                        highlight_lines = highlight_lines.concat([[x-1, y-1, x, y]])
                        visualizations.push(new visualization_result(new_tagged_string, highlight_lines, diagonal, candidate_lines, false, myers))
                    }
                }

                endpoints[diagonal] = x
                intermediate_strings[diagonal] = new_tagged_string
                if (x >= top_len && y >= down_len) {
                    done = true
                    break
                }
            }
        }
    }

    function middle_snake(myers, visualizations, startX, endX, startY, endY) {
        var top_len = endX - startX
        var down_len = endY - startY
        var delta = top_len - down_len
        for (var D = 0; D <= ceil((top_len + down_len) / 2); D++) {
            for (var diagonal = -D; diagonal <= D; diagonal += 2) { // k = diagonal, forward
                
            }
            for (var diagonal = -D; diagonal <= D; diagonal += 2) { // k = diagonal, backward
                
            }

        }
    }

    function step_myers_bidir_2(myers, visualizations) {

    }

    // Bidirectional directional myers diff algorithm
    function step_myers_bidir(myers, visualizations) {
        var endpoints = new Array()
        endpoints[1] = 0

        var down_tagged_string = tagged_string(myers.down_string, TAG_DOWN)
        var top_tagged_string = tagged_string(myers.top_string, TAG_TOP)

        var intermediate_strings = new Array()
        intermediate_strings[1] = down_tagged_string

        var top_len = myers.top_string.length
        var down_len = myers.down_string.length
        var MAX = top_len + down_len
        var done = false
        for (var step=0; step <= MAX && ! done; step++) {
            for (var diagonal = -step; diagonal <= step; diagonal+=2) {

                function get_line(x, down) {
                    // if down is true, we are starting from the diagonal above us, which is larger
                    // if down is false, we are starting from the diagonal to our left, which is smaller
                    var other_diagonal = diagonal + (down ? 1 : -1)
                    var start_x = x - (down ? 0 : 1)
                    var start_y = start_x - other_diagonal
                    return [start_x, start_y, start_x + (down ? 0 : 1), start_y + (down ? 1 : 0)]
                }

                // Whether we traverse down (y+1) or right (x+1)
                var go_down

                var candidate_lines = []
                if (diagonal == -step) {
                    var top_x = endpoints[diagonal+1]
                    go_down = true
                    candidate_lines.push(get_line(top_x, go_down))
                } else if (diagonal == step) {
                    var left_x = endpoints[diagonal-1]
                    go_down = false
                    candidate_lines.push(get_line(left_x + 1, go_down))
                } else {
                    var left_x = endpoints[diagonal-1], top_x = endpoints[diagonal+1]
                    go_down = left_x < top_x
                    candidate_lines.push(get_line(top_x, true), get_line(left_x + 1, false))
                }

                var x
                if (go_down) {
                    // go down
                    x = endpoints[diagonal + 1]
                } else {
                    // go right
                    x = endpoints[diagonal - 1] + 1
                }
                var y = x - diagonal

                // Skip cases that go off the grid
                // Note we check >, not >=, because we have a terminating dots at x == top_len / y == down_len
                if (x > top_len || y > down_len) {
                    endpoints[diagonal] = x
                    continue
                }

                // update our tagged string
                var new_tagged_string
                if (go_down) {
                    new_tagged_string = intermediate_strings[diagonal + 1]
                } else {
                    new_tagged_string = intermediate_strings[diagonal - 1]
                }
                // Copy and remove all RECENT annotations
                new_tagged_string = new_tagged_string.slice(0)
                remove_tag(new_tagged_string, TAG_RECENT)

                if (step > 0) {
                    if (go_down) {
                        // We just traversed from y-1 to y. Strike through the character corresponding to that edge (y-1)
                        if (y <= down_len) {
                            var idx = index_of_tagged_char(new_tagged_string, y-1, TAG_DOWN)
                            new_tagged_string[idx] = new_tagged_string[idx].retag(TAG_DOWN | TAG_DELETED | TAG_RECENT)
                        }
                    } else {
                        // We just traversed from x-1 to x. Insert the character corresponding to that edge (x-1)
                        // Where do we insert it? It can go after the last element that's tagged with TOP or DELETED
                        if (x <= top_len) {
                            var new_element = top_tagged_string[x-1]
                            var last_top_tag_idx = new_tagged_string.length
                            while (last_top_tag_idx--) {
                                if (new_tagged_string[last_top_tag_idx].tag & (TAG_TOP | TAG_DELETED)) {
                                    break;
                                }
                            }
                            // last_top_tag_idx is now the index of the last top tagged element, or -1
                            // insert after it
                            new_tagged_string.splice(last_top_tag_idx + 1, 0, new_element.retag(new_element.tag | TAG_RECENT))
                        }
                    }
                }

                var highlight_lines = []

                if (visualizations) {
                    highlight_lines.push([x - (go_down ? 0 : 1), y - (go_down ? 1 : 0), x, y]) 
                    visualizations.push(new visualization_result(new_tagged_string, highlight_lines, diagonal, candidate_lines, true, myers))
                }

                // Traverse the snake
                while (x < top_len && y < down_len && myers.top_string[x] == myers.down_string[y]) {
                    x++
                    y++
                    if (visualizations) {
                        // copy and update our tagged string
                        // the character at index y-1 in our string is now shared
                        new_tagged_string = new_tagged_string.slice(0)
                        remove_tag(new_tagged_string, TAG_RECENT)
                        var idx = new_tagged_string.indexOf(down_tagged_string[y-1])
                        new_tagged_string[idx] = new_tagged_string[idx].retag(TAG_DOWN | TAG_TOP | TAG_RECENT)

                        highlight_lines = highlight_lines.concat([[x-1, y-1, x, y]])
                        visualizations.push(new visualization_result(new_tagged_string, highlight_lines, diagonal, candidate_lines, false, myers))
                    }
                }

                endpoints[diagonal] = x
                intermediate_strings[diagonal] = new_tagged_string
                if (x >= top_len && y >= down_len) {
                    done = true
                    break
                }
            }
        }
    }

    self.unidir = step_myers_unidir
    self.biidir = step_myers_bidir
    return self
}
